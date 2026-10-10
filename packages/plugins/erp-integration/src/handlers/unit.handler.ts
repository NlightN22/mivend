import { Injectable, Logger } from '@nestjs/common';
import { withAggregateLock } from 'shared';
import { ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';

import { UnitRecord } from '../entities/unit-record.entity';
import { loggerCtx } from '../types';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `unit` stream into UnitRecord, then refreshes matching variants — field-by-field
// accounting: docs/ai/erp-streams-map.md's `unit` row.
@Injectable()
export class UnitStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    // Same per-unit lock as ProductStreamHandler: the unit write and the variant refresh are atomic
    // against a product that is being imported with this unit as its default sales unit.
    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        return withAggregateLock(this.connection, ctx, `unit:${entityId}`, txCtx =>
            this.applyUnit(txCtx, entityId, payload),
        );
    }

    private async applyUnit(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const code = String(payload.code ?? '');
        const name = String(payload.name ?? '');
        if (!code || !name) {
            return inboundNoop(`unit ${entityId}: missing code/name, skipping`);
        }

        const ownerId =
            typeof payload.ownerId === 'string' && payload.ownerId !== '' ? payload.ownerId : null;
        const ratioToBase = typeof payload.ratioToBase === 'number' ? payload.ratioToBase : 0;
        const weightKg = typeof payload.weightKg === 'number' ? payload.weightKg : null;
        // The contract names this field volume_l, but the ERP sends cubic metres.
        const volumeM3 = typeof payload.volumeL === 'number' ? payload.volumeL : null;
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
                volumeM3,
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
                    volumeM3,
                    isDeleted,
                }),
            );
        }

        Logger.verbose(
            `Upserted UnitRecord entityId=${entityId} code=${code} ratioToBase=${ratioToBase}`,
            loggerCtx,
        );

        await this.refreshVariants(ctx, entityId, ratioToBase, name, weightKg, volumeM3);
        return inboundApplied();
    }

    // Bounded, values-changed-only UPDATE (see docs/ai/erp-streams-map.md's `unit` row) — via the
    // ctx-scoped repository, not rawConnection, so it stays inside the inbox row's transaction
    // (audit finding: rawConnection would commit independently of a later failure in apply()).
    private async refreshVariants(
        ctx: RequestContext,
        defaultSalesUnitId: string,
        unitRatioToBase: number,
        unitName: string,
        unitWeightKg: number | null,
        unitVolumeM3: number | null,
    ): Promise<void> {
        const result = await this.connection
            .getRepository(ctx, ProductVariant)
            .createQueryBuilder()
            .update(ProductVariant)
            .set({
                customFields: {
                    unitRatioToBase,
                    unitName,
                    unitWeightKg,
                    unitVolumeM3,
                },
            })
            .where('"customFieldsDefaultsalesunitid" = :defaultSalesUnitId', { defaultSalesUnitId })
            .andWhere('"deletedAt" IS NULL')
            .andWhere(
                '("customFieldsUnitratiotobase" IS DISTINCT FROM :unitRatioToBase OR ' +
                    '"customFieldsUnitname" IS DISTINCT FROM :unitName OR ' +
                    '"customFieldsUnitweightkg" IS DISTINCT FROM :unitWeightKg OR ' +
                    '"customFieldsUnitvolumem3" IS DISTINCT FROM :unitVolumeM3)',
                { unitRatioToBase, unitName, unitWeightKg, unitVolumeM3 },
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
