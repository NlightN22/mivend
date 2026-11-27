import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ExternalOrderRetentionService, ExternalOrderService, OrderEventVersionService } from '@mivend/plugin-erp-order';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';
import { SettlementPendingService } from '@mivend/plugin-settlement';

import { buildExternalOrderInput, orderAccountingFacts } from './external-order-input';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { decideOrderChangedRoute } from './order-changed-route';
import { OrderLineResolver } from './order-line-resolver';
import { parseTimestamp } from './settlement-payload';

// Applies the erp.order.events.v1 `changed` stream (the order document's own data); reserve, derived status and
// paid amount arrive on erp.order-state.events.v1. Rules: docs/order-changed-handler.md
@Injectable()
export class OrderChangedStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly reservationWriteOffSyncService: ReservationWriteOffSyncService,
        private readonly lineResolver: OrderLineResolver,
        private readonly externalOrderService: ExternalOrderService,
        private readonly settlementPending: SettlementPendingService,
        private readonly retention: ExternalOrderRetentionService,
        private readonly orderVersions: OrderEventVersionService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const version = typeof payload.version === 'string' ? payload.version : '';
        if (payload.isDeleted === true || version === '')
            return this.applyEvent(ctx, entityId, payload);
        const guarded = await this.orderVersions.apply(
            ctx,
            entityId,
            'order-changed',
            version,
            txCtx => this.applyEvent(txCtx, entityId, payload),
        );
        return guarded.stale
            ? inboundNoop(`order-changed ${entityId}: version not newer than stored`)
            : guarded.value;
    }

    private async applyEvent(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // A deleted order is a no-op, not a retry (docs/order-changed-handler.md).
        if (payload.isDeleted === true) {
            return inboundNoop(`order-changed ${entityId}: deleted, skipping`);
        }

        const status = payload.status != null ? String(payload.status) : '';
        const contractId = payload.contractId != null ? String(payload.contractId) : null;
        const orderUuid = payload.orderUuid != null ? String(payload.orderUuid) : null;
        const documentNumber =
            payload.documentNumber != null ? String(payload.documentNumber) : null;

        const stored = await this.externalOrderService.findByErpOrderId(ctx, entityId);
        const route = decideOrderChangedRoute(orderUuid, stored);
        if (route === 'apply-to-mivend-order') {
            await this.reservationWriteOffSyncService.handleOrderChanged(ctx, {
                orderUuid,
                orderEntityId: entityId,
                status,
                contractId,
                documentNumber,
                erpFacts: orderAccountingFacts(payload),
                reserveUntil: parseTimestamp(payload.reserveUntil),
            });
            await this.settlementPending.attachOrder(ctx, entityId);
            return inboundApplied();
        }

        const orderDate = parseTimestamp(payload.orderDate);
        if (
            route === 'create-external' &&
            payload.markedForDeletion === true &&
            orderDate &&
            (await this.retention.isBeyondWindow(ctx, orderDate))
        ) {
            return inboundNoop(
                `order-changed ${entityId}: deletion-marked order older than the retention window, not created`,
            );
        }

        const resolved = await this.lineResolver.resolve(
            ctx,
            'order-changed',
            entityId,
            payload.lines,
            true,
        );
        const skipped = resolved.withoutProductId + resolved.unknownProducts;
        const result = await this.externalOrderService.upsert(
            ctx,
            buildExternalOrderInput(entityId, payload, resolved.lines, skipped),
        );
        await this.settlementPending.attachOrder(ctx, entityId);
        if (result.counterpartyPending || skipped > 0) {
            return inboundNoop(
                `order-changed ${entityId}: external order ${result.kind}` +
                    (result.counterpartyPending ? ', counterparty not imported yet' : '') +
                    (skipped > 0 ? `, ${skipped} line(s) without a known product skipped` : ''),
            );
        }
        return inboundApplied();
    }
}
