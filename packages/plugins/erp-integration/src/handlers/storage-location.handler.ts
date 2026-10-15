import { Injectable, Logger } from '@nestjs/common';
import { ProductVariantService, RequestContext, TransactionalConnection } from '@vendure/core';
import { DocumentsService } from '@mivend/plugin-documents';
import { withAggregateLock } from 'shared';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { StorageLocationAssignment } from '../entities/storage-location-assignment.entity';
import { MissingDependencyError } from '../types';

const loggerCtx = 'IntegrationStorageLocationHandler';

interface VariantOrganization {
    id: string;
    organizationId: number | null;
    organizationPriority: number | null;
    organizationSourceEntityId: string | null;
}

// A product has several storage-location rows, each its own entity, so the winner is recomputed
// from all persisted rows under a per-product lock; removing a row lets the next best take over.
@Injectable()
export class StorageLocationStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly productVariantService: ProductVariantService,
        private readonly documentsService: DocumentsService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const productId = String(payload.productId ?? '');
        if (!productId) {
            return inboundNoop(`storage-location ${entityId}: missing productId, skipping`);
        }
        const organizationErpId =
            payload.organizationId != null ? String(payload.organizationId) : '';
        // `priority` is a plain proto3 int32: an absent key means 0, the most preferred value.
        const priority = Number(payload.priority ?? 0);
        const hasOrganization = payload.isDeleted !== true && organizationErpId !== '';

        return withAggregateLock(
            this.connection,
            ctx,
            `storage-location-product:${productId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, StorageLocationAssignment);
                if (hasOrganization) {
                    await repo.upsert({ entityId, productId, organizationErpId, priority }, [
                        'entityId',
                    ]);
                } else {
                    const { affected } = await repo.delete({ entityId, productId });
                    if (!affected) {
                        return inboundNoop(
                            `storage-location ${entityId}: no organization assignment, skipping`,
                        );
                    }
                }
                await this.applyWinner(txCtx, productId);
                return inboundApplied();
            },
        );
    }

    private async applyWinner(ctx: RequestContext, productId: string): Promise<void> {
        const winner = await this.connection
            .getRepository(ctx, StorageLocationAssignment)
            .createQueryBuilder('a')
            .where('a.productId = :productId', { productId })
            .orderBy('a.priority', 'ASC')
            .addOrderBy('a.entityId', 'ASC')
            .getOne();
        const variant = await this.findVariant(productId);
        if (!variant) {
            if (!winner) return;
            // Ordinary eventual-consistency race (product stream not consumed yet): retry.
            throw new MissingDependencyError(
                `storage-location ${winner.entityId}: variant not found for productId=${productId}`,
            );
        }

        let organizationId: number | null = null;
        if (winner) {
            organizationId = await this.documentsService.findRequisitesIdByErpId(
                ctx,
                winner.organizationErpId,
            );
            if (organizationId == null) {
                throw new MissingDependencyError(
                    `storage-location ${winner.entityId}: no OrganizationRequisites found for ` +
                        `organizationId=${winner.organizationErpId}`,
                );
            }
        }
        const organizationPriority = winner?.priority ?? null;
        const organizationSourceEntityId = winner?.entityId ?? null;
        if (
            variant.organizationId === organizationId &&
            variant.organizationPriority === organizationPriority &&
            variant.organizationSourceEntityId === organizationSourceEntityId
        ) {
            return;
        }

        await this.productVariantService.update(ctx, [
            {
                id: variant.id,
                customFields: { organizationId, organizationPriority, organizationSourceEntityId },
            },
        ]);
        Logger.verbose(
            `Set organizationId=${String(organizationId)} (source=${String(organizationSourceEntityId)}) for productId=${productId}`,
            loggerCtx,
        );
    }

    private async findVariant(productId: string): Promise<VariantOrganization | undefined> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .addSelect('pv."customFieldsOrganizationid"', 'organizationId')
            .addSelect('pv."customFieldsOrganizationpriority"', 'organizationPriority')
            .addSelect('pv."customFieldsOrganizationsourceentityid"', 'organizationSourceEntityId')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<VariantOrganization>();
        return row;
    }
}
