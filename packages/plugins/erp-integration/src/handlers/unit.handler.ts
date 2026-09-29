import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { UnitRecord } from '../entities/unit-record.entity';
import { loggerCtx } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

// Applies Integration Service's `unit` stream (UnitChanged, issue #103) — a small reference feed
// (per-unit ratio/weight/volume, shared classifier or product-owned packaging unit) upserted into
// UnitRecord by entityId. Never touches Product/ProductVariant directly; ProductStreamHandler
// (product.handler.ts) reads this table separately via UnitLookupService, resolved against
// ProductChanged.defaultSalesUnitId — deliberately decoupled so a `unit-changed` event arriving
// before or after the `product` event for the same product is handled identically, by whichever
// arrives second re-reading (or, for product.handler.ts, retrying via MissingDependencyError
// until) the other's already-persisted state.
//
// Field-by-field outcome (external-integration-rules skill's mandatory per-field accounting,
// against unit_changed_pb.d.ts as installed):
// - event_id/occurred_at/updated_at: envelope-only, no current consumer (same as every handler).
// - entity_id: the join key itself — consumed as this row's own id.
// - version: drives the inbox's own out-of-order guard centrally, not read here.
// - owner_id (optional string): consumed, stored as-is (null for a shared classifier unit).
// - code/name: consumed, stored as-is.
// - ratio_to_base (plain double): consumed. Non-optional on the wire — an absent key means a real
//   zero, not "unset" (see types.ts's proto3 zero-value comment), so read as `?? 0` rather than
//   skipping the row.
// - weight_kg/volume_l (optional double): consumed when present; genuinely absent otherwise (real
//   presence tracking, unlike ratio_to_base above).
// - width_mm/height_mm/length_mm (optional double): NOT consumed — no current mivend feature
//   reads dimensions, only weight/volume (docs/order-flow.md's mivend#103 section). Revisit if a
//   future feature needs them.
// - is_deleted (optional bool): consumed, stored as a flag only — deliberately does NOT delete the
//   row (same "never destructive on a soft signal" reasoning as vat-rate.handler.ts); a deleted
//   unit still resolvable is safer than a silent MissingDependencyError loop on whatever product
//   still references it.
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
    }
}
