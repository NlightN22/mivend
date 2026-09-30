import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { UnitRecord } from '../entities/unit-record.entity';
import { loggerCtx } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

// Applies the `unit` stream into UnitRecord, then refreshes matching variants — field-by-field
// accounting: docs/ai/erp-streams-map.md's `unit` row.
@Injectable()
export class UnitStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

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

        await this.refreshVariants(entityId, ratioToBase, weightKg, volumeL);
    }

    // Audit finding (mivend#103, MEDIUM): defaultSalesUnitId=<the shared base unit> can match
    // nearly every variant in the catalog — a plain ProductVariantService.update over all of them
    // per UnitChanged would be a multi-thousand-row fan-out with a full event/search-index cost
    // per row, inside one inbox-row transaction. A direct, values-changed-only UPDATE (no service
    // call, no events — these are readonly ERP-derived fields) keeps this to the rows that
    // actually moved, and makes a repeated identical UnitChanged a no-op (0 rows).
    private async refreshVariants(
        defaultSalesUnitId: string,
        unitRatioToBase: number,
        unitWeightKg: number | null,
        unitVolumeL: number | null,
    ): Promise<void> {
        const result = await this.connection.rawConnection
            .createQueryBuilder()
            .update('product_variant')
            .set({
                customFieldsUnitratiotobase: unitRatioToBase,
                customFieldsUnitweightkg: unitWeightKg,
                customFieldsUnitvolumel: unitVolumeL,
            })
            .where('"customFieldsDefaultsalesunitid" = :defaultSalesUnitId', { defaultSalesUnitId })
            .andWhere('"deletedAt" IS NULL')
            .andWhere(
                '("customFieldsUnitratiotobase" IS DISTINCT FROM :unitRatioToBase OR ' +
                    '"customFieldsUnitweightkg" IS DISTINCT FROM :unitWeightKg OR ' +
                    '"customFieldsUnitvolumel" IS DISTINCT FROM :unitVolumeL)',
                { unitRatioToBase, unitWeightKg, unitVolumeL },
            )
            .execute();

        const affected = result.affected ?? 0;
        if (affected > 0) {
            Logger.verbose(
                `Refreshed ${affected} variant(s) for defaultSalesUnitId=${defaultSalesUnitId}`,
                loggerCtx,
            );
        }
    }
}
