import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, ProductVariantService } from '@vendure/core';

import { UnitRecord } from '../entities/unit-record.entity';
import { loggerCtx } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

// Applies the `unit` stream into UnitRecord, then refreshes matching variants — field-by-field
// accounting: docs/ai/erp-streams-map.md's `unit` row.
@Injectable()
export class UnitStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly productVariantService: ProductVariantService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const code = String(payload.code ?? '');
        const name = String(payload.name ?? '');
        if (!code || !name) {
            Logger.warn(`unit ${entityId}: missing code/name, skipping`, loggerCtx);
            return;
        }

        const ownerId =
            typeof payload.ownerId === 'string' && payload.ownerId !== '' ? payload.ownerId : null;
        const ratioToBase = typeof payload.ratioToBase === 'number' ? payload.ratioToBase : 0;
        const weightKg = typeof payload.weightKg === 'number' ? payload.weightKg : null;
        const volumeL = typeof payload.volumeL === 'number' ? payload.volumeL : null;
        const isDeleted = payload.isDeleted === true;

        const repo = this.connection.getRepository(ctx, UnitRecord);
        const existing = await repo.findOne({ where: { entityId } });

        if (existing) {
            await repo.save({
                ...existing,
                ownerId,
                code,
                name,
                ratioToBase,
                weightKg,
                volumeL,
                isDeleted,
            });
        } else {
            await repo.save(
                repo.create({
                    entityId,
                    ownerId,
                    code,
                    name,
                    ratioToBase,
                    weightKg,
                    volumeL,
                    isDeleted,
                }),
            );
        }

        Logger.verbose(
            `Upserted UnitRecord entityId=${entityId} code=${code} ratioToBase=${ratioToBase}`,
            loggerCtx,
        );

        await this.refreshVariants(ctx, entityId, ratioToBase, weightKg, volumeL);
    }

    private async refreshVariants(
        ctx: RequestContext,
        defaultSalesUnitId: string,
        unitRatioToBase: number,
        unitWeightKg: number | null,
        unitVolumeL: number | null,
    ): Promise<void> {
        const rows = await this.connection.rawConnection
            .createQueryBuilder()
            .select('v.id', 'id')
            .from('product_variant', 'v')
            .where('v."customFieldsDefaultsalesunitid" = :defaultSalesUnitId', {
                defaultSalesUnitId,
            })
            .getRawMany<{ id: string }>();
        if (rows.length === 0) {
            return;
        }

        await this.productVariantService.update(
            ctx,
            rows.map(row => ({
                id: row.id,
                customFields: { unitRatioToBase, unitWeightKg, unitVolumeL },
            })),
        );
        Logger.verbose(
            `Refreshed ${rows.length} variant(s) for defaultSalesUnitId=${defaultSalesUnitId}`,
            loggerCtx,
        );
    }
}
