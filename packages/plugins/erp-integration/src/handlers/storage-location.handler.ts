import { Injectable, Logger } from '@nestjs/common';
import { ProductVariantService, RequestContext, TransactionalConnection } from '@vendure/core';
import { DocumentsService } from '@mivend/plugin-documents';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationStorageLocationHandler';

// Applies Integration Service's `storage-location` stream (StorageLocationChanged, 1C's
// МестаХраненияНоменклатуры register) — the real source for ProductVariant.customFields
// .organizationId (docs/payments.md "Organizations": one storage location = one product = one
// organization). Only ~4/30142 rows carry organization_id (see the proto's own doc comment) — a
// row without one is a normal address-only assignment, not an error, and must never blank a
// previously-set organizationId. The physical address fields (sector/floor/row/rack/shelf/cell)
// have no target entity yet and are deliberately not modeled by this handler.
//
// A product can have several storage-location rows, each its OWN Kafka entity (entityId =
// storage_location_id) with its own independent version history — the inbox's per-entityId
// ordering guard doesn't pick a winner across different locations for the same product. The
// contract's own rule is "lowest priority wins"; organizationPriority (persisted alongside
// organizationId) lets a later-arriving row compare against the current winner instead of
// last-message-wins.
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
    ): Promise<void> {
        const productId = String(payload.productId ?? '');
        const organizationErpId =
            payload.organizationId != null ? String(payload.organizationId) : '';
        const priority = Number(payload.priority ?? NaN);
        const isDeleted = payload.isDeleted === true;

        if (!productId) {
            Logger.warn(`storage-location ${entityId}: missing productId, skipping`, loggerCtx);
            return;
        }
        if (isDeleted || !organizationErpId) {
            // Deletion, or an address-only row (the ~99.99% case) — nothing to apply for the
            // organization dimension. Address fields are out of scope (see class doc comment).
            Logger.verbose(
                `storage-location ${entityId}: no organization assignment (deleted=${isDeleted}), skipping`,
                loggerCtx,
            );
            return;
        }
        if (Number.isNaN(priority)) {
            Logger.warn(`storage-location ${entityId}: missing priority, skipping`, loggerCtx);
            return;
        }

        const variantId = await this.findVariantId(productId);
        if (!variantId) {
            Logger.warn(
                `storage-location ${entityId}: variant not found for productId=${productId}`,
                loggerCtx,
            );
            return;
        }

        const organizationId = await this.documentsService.findRequisitesIdByErpId(
            ctx,
            organizationErpId,
        );
        if (organizationId == null) {
            Logger.warn(
                `storage-location ${entityId}: no OrganizationRequisites found for organizationId=${organizationErpId}, skipping`,
                loggerCtx,
            );
            return;
        }

        const current = await this.getCurrentAssignment(variantId);
        if (
            current &&
            current.organizationPriority != null &&
            priority > current.organizationPriority
        ) {
            Logger.verbose(
                `storage-location ${entityId}: priority ${priority} does not beat current winner ` +
                    `${current.organizationPriority} for productId=${productId}, skipping`,
                loggerCtx,
            );
            return;
        }

        await this.productVariantService.update(ctx, [
            { id: variantId, customFields: { organizationId, organizationPriority: priority } },
        ]);
        Logger.verbose(
            `Set organizationId=${organizationId} (priority=${priority}) for productId=${productId}`,
            loggerCtx,
        );
    }

    private async findVariantId(productId: string): Promise<string | undefined> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{ id: string }>();
        return row?.id;
    }

    private async getCurrentAssignment(
        variantId: string,
    ): Promise<{ organizationPriority: number | null } | undefined> {
        return this.connection.rawConnection
            .createQueryBuilder()
            .select('pv."customFieldsOrganizationpriority"', 'organizationPriority')
            .from('product_variant', 'pv')
            .where('pv.id = :variantId', { variantId })
            .getRawOne<{ organizationPriority: number | null }>();
    }
}
