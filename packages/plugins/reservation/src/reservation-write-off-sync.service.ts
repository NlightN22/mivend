import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventBus, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';

import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssueService } from './reservation-reconciliation-issue.service';
import { ReservationService } from './reservation.service';
import { UnknownOrderUuidError } from './reservation-errors';
import { loggerCtx } from './types';

export interface OrderRegistrationResultInput {
    // MiVend's own order uuid (mivend#207), echoed back by the ERP. Preferred correlation key
    // over localOrderId/orderEntityId below; null only for results predating this field.
    orderUuid: string | null;
    // ERP-side order id — absent on a rejected result. Fallback correlation key only.
    orderEntityId: string | null;
    // Original order.confirmed request id, echoed back by the ERP — kept for error/log context.
    requestEntityId: string | null;
    // Local Order id, resolved by the caller from requestEntityId via integration_outbox
    // (issue #204 follow-up). Preferred over orderEntityId whenever present.
    localOrderId: string | null;
    rejected: boolean;
    // Already resolved from the ERP's productId to a Vendure ProductVariant id by the caller
    // (erp-integration's OrderRegistrationResultHandler) — this service stays free of the
    // Kafka/protobuf decode concern, same split as ReservationErpSyncService.
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    // ERP productIds from reservedLines that the caller could NOT resolve to a ProductVariant at
    // all — reported as a distinct ReservationReconciliationIssue (mivend.audit.72's HIGH
    // finding), never silently folded into "not confirmed in this result yet."
    unresolvedProductIds: string[];
    // Staff-facing informational fields, persisted onto Order.customFields — never used in any
    // release/quantity-match decision below. documentNumber is a real proto `optional string`
    // (null means genuinely absent); status is a plain proto3 string ('' means absent, per the
    // zero-value-omission rule — see external-integration-rules skill).
    documentNumber: string | null;
    status: string;
    // BusinessRejectionReason.code/message (issue #204), non-null only when `rejected` is true.
    rejectionReasonCode: string | null;
    rejectionReasonText: string | null;
}

// Bridges company.orders.events.v1.order-changed (issue #110/#72) — the order's ongoing,
// current-state view fired repeatedly over its lifetime, unlike OrderRegistrationResultInput's
// one-shot registration outcome. Reuses handleOrderRegistrationResult's release-matching logic
// (releaseMatchingReservations below) rather than duplicating it: that matching is already
// naturally idempotent/re-callable — it only ever acts on Reservation rows still `status:
// 'active'` and only releases when local vs ERP quantity fully matches per variant, so a repeat
// call with the same reservedQuantity is a safe no-op, and a later call with an updated quantity
// is just a fresh comparison. There is no `rejected`/`documentNumber` concept on this stream
// (order-changed carries no business-rejection reason or document number — only
// order-registration-result does), so those are fixed at false/null for this caller rather than
// exposed on this input shape.
export interface OrderChangedInput {
    // Real optional presence (mivend#207): absent for orders not registered through our
    // integration. Preferred correlation key over orderEntityId below when present.
    orderUuid: string | null;
    orderEntityId: string;
    // Plain proto3 string — '' means absent (zero-value-omission rule), passed through verbatim.
    status: string;
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    // Real proto `optional string` — null means genuinely not sent, not a zero-value.
    contractId: string | null;
}

// Bridges company.orders.events.v1.order-registration-result into the local reservation domain
// (issue #75, the real release trigger ReservationErpSyncService's own doc comment defers to).
// This event is emitted as a direct, same-transaction consequence of ERP actually posting the
// order document — genuinely stronger evidence than the generic order-status callback's bare
// RESERVED/CONFIRMED labels, so this is the one place allowed to release a reservation before a
// terminal CANCELLED.
//
// Deliberately never publishes ReservationReleasedEvent: that event drives an outbound "please
// release" command back to the ERP (see plugin-sync's ReservationConsumer) — sending it right after
// ERP itself just confirmed the write-off would be backwards, same reasoning as the abandoned
// stockAllocated-bridge attempt this issue's history already worked through.
@Injectable()
export class ReservationWriteOffSyncService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
        private reconciliationIssueService: ReservationReconciliationIssueService,
        private eventBus: EventBus,
    ) {}

    async handleOrderRegistrationResult(
        ctx: RequestContext,
        input: OrderRegistrationResultInput,
    ): Promise<void> {
        // orderUuid first (mivend#207), then localOrderId, then orderEntityId as the last
        // fallback for results that predate orderUuid.
        const orderId = input.orderUuid
            ? await this.findOrderIdByUuid(input.orderUuid)
            : input.localOrderId
              ? input.localOrderId
              : input.orderEntityId
                ? await this.findOrderIdByErpId(input.orderEntityId)
                : null;
        const order = orderId
            ? await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId } })
            : null;
        if (!orderId || !order) {
            // mivend.audit.72 + issue #204 follow-up + issue #211: never a silent, permanent skip
            // — throw a distinguishable type (see its own doc comment) and let the inbox retry.
            throw new UnknownOrderUuidError(
                `order-registration-result: no Order found via orderUuid=${input.orderUuid ?? ''}, ` +
                    `requestEntityId=${input.requestEntityId ?? ''} or orderEntityId=${input.orderEntityId ?? ''}`,
            );
        }

        // REJECTED is non-terminal (issue #204): captured here so a later, non-rejected result
        // for the same order can clear both the reason fields and erpStatus back to SENT_TO_ERP.
        const wasRejected = order.customFields.erpStatus === 'REJECTED';
        const wasPending =
            order.customFields.erpStatus == null || order.customFields.erpStatus === 'PENDING';
        const missingErpOrderId = !order.customFields.erpOrderId && !!input.orderEntityId;

        // Purely informational for staff — never read by the release/quantity-match logic below.
        const customFields: Partial<typeof order.customFields> = {
            erpRegistrationDocumentNumber: input.documentNumber,
            erpRegistrationStatus: input.status,
        };
        if (input.rejected) {
            customFields.erpRejectionReasonCode = input.rejectionReasonCode;
            customFields.erpRejectionReasonText = input.rejectionReasonText;
        } else if (wasRejected) {
            customFields.erpRejectionReasonCode = null;
            customFields.erpRejectionReasonText = null;
        }
        // `repo.update()`, not `.save(order)` — see docs/concurrency.md; same gotcha as
        // ReservationService.setOrderReservationState (unhydrated Order, calculated getters throw).
        // Changed fields only: a full snapshot would erase a concurrent erpStatus/erpOrderId write.
        await this.connection.getRepository(ctx, Order).update(order.id, { customFields });
        order.customFields = { ...order.customFields, ...customFields };

        // erpStatus is owned by plugin-erp-order's ErpOrderService.updateStatus — never written
        // directly here, same separation as ErpCallbackController's own order-status path.
        if (input.rejected) {
            this.eventBus.publish(new ErpOrderStatusEvent(ctx, order.code, 'REJECTED'));
        } else if (wasRejected || wasPending || missingErpOrderId) {
            // Carries orderEntityId so ErpOrderService.updateStatus stores erpOrderId, the key later
            // order-changed events correlate on; nothing else sets it in this flow.
            this.eventBus.publish(
                new ErpOrderStatusEvent(
                    ctx,
                    order.code,
                    'SENT_TO_ERP',
                    input.orderEntityId ?? undefined,
                ),
            );
        }

        if (input.unresolvedProductIds.length > 0) {
            for (const externalProductId of input.unresolvedProductIds) {
                await this.reconciliationIssueService.reportUnresolvedProductMapping(ctx, {
                    orderId,
                    externalProductId,
                    // orderEntityId is absent on a rejected result; '' is purely informational
                    // here, never a correlation key (that already happened above).
                    orderEntityId: input.orderEntityId ?? '',
                });
            }
            Logger.error(
                `order-registration-result: order ${orderId} (erp ${input.orderEntityId ?? ''}) — ` +
                    `${input.unresolvedProductIds.length} productId(s) could not be resolved to a ` +
                    'ProductVariant, reported for staff follow-up',
                loggerCtx,
            );
        }

        if (input.rejected) {
            // Never release on a rejection — per the user's own framing, ERP will eventually
            // resolve the underlying document one way or the other (re-post, manual correction,
            // or a genuine CANCELLED, which ReservationErpSyncService already handles).
            Logger.warn(
                `order-registration-result: order ${orderId} (erp ${input.orderEntityId ?? ''}) was ` +
                    'rejected by the ERP — leaving reservations active',
                loggerCtx,
            );
            return;
        }

        await this.releaseMatchingReservations(
            ctx,
            orderId,
            order,
            input.reservedLines,
            input.orderEntityId ?? '',
            'order-registration-result',
        );
    }

    // Issue #110: bridges company.orders.events.v1.order-changed. Only the FK resolve (entityId
    // → productId, both handled by the caller, erp-integration's OrderChangedStreamHandler) and
    // the informational customFields differ from handleOrderRegistrationResult above — the actual
    // release-matching logic is shared via releaseMatchingReservations, see OrderChangedInput's
    // own doc comment for why reuse is safe here.
    async handleOrderChanged(ctx: RequestContext, input: OrderChangedInput): Promise<void> {
        // orderUuid first (mivend#207/search-platform#180) when present; orderEntityId otherwise
        // (orders not registered through our integration carry no orderUuid at all).
        const orderId = input.orderUuid
            ? await this.findOrderIdByUuid(input.orderUuid)
            : await this.findOrderIdByErpId(input.orderEntityId);
        const order = orderId
            ? await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId } })
            : null;
        if (!orderId || !order) {
            // Same cross-entity-dependency retry rule as handleOrderRegistrationResult above
            // (external-integration-rules skill) — issue #211: same distinguishable error type.
            throw new UnknownOrderUuidError(
                `order-changed: no Order found via orderUuid=${input.orderUuid ?? ''} or ` +
                    `orderEntityId=${input.orderEntityId}`,
            );
        }

        const customFields: Partial<typeof order.customFields> = {
            erpOrderStatus: input.status,
        };
        if (input.contractId !== null) {
            // Real optional presence: an absent contractId on a later event does not mean the
            // order lost its contract — never overwrite an already-known value with null.
            customFields.erpContractId = input.contractId;
        }
        // `repo.update()`, not `.save(order)` — same calculated-getter gotcha as
        // handleOrderRegistrationResult above.
        await this.connection.getRepository(ctx, Order).update(order.id, { customFields });
        order.customFields = { ...order.customFields, ...customFields };

        await this.releaseMatchingReservations(
            ctx,
            orderId,
            order,
            input.reservedLines,
            input.orderEntityId,
            'order-changed',
        );
    }

    private async releaseMatchingReservations(
        ctx: RequestContext,
        orderId: string,
        order: Order,
        reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>,
        orderEntityId: string,
        source: 'order-registration-result' | 'order-changed',
    ): Promise<void> {
        const reservationRepo = this.connection.getRepository(ctx, Reservation);
        const active = await reservationRepo.find({ where: { orderId, status: 'active' } });
        if (active.length === 0) {
            return;
        }

        // Aggregated by variant, not per reservation row: an order can have two active
        // reservations for the same variant (two order lines), while the ERP reports one confirmed
        // quantity per product — variant-level is the only shape actually comparable to that.
        const erpQuantityByVariant = new Map<string, number>();
        for (const line of reservedLines) {
            erpQuantityByVariant.set(
                line.productVariantId,
                (erpQuantityByVariant.get(line.productVariantId) ?? 0) + line.reservedQuantity,
            );
        }
        const localQuantityByVariant = new Map<string, number>();
        for (const reservation of active) {
            localQuantityByVariant.set(
                reservation.productVariantId,
                (localQuantityByVariant.get(reservation.productVariantId) ?? 0) +
                    reservation.quantity,
            );
        }

        const toRelease: Reservation[] = [];
        for (const [variantId, localQuantity] of localQuantityByVariant) {
            const erpQuantity = erpQuantityByVariant.get(variantId);
            if (erpQuantity === undefined) {
                // Not confirmed in this result — leave active, may arrive in a later document.
                continue;
            }
            if (erpQuantity !== localQuantity) {
                // The ERP is the source of truth (#199): it holds whatever it reserved, so our hold
                // is released like a matching one; the difference is only recorded for staff.
                await this.reconciliationIssueService.reportQuantityMismatch(ctx, {
                    orderId,
                    productVariantId: variantId,
                    localQuantity,
                    erpQuantity,
                    orderEntityId,
                });
                Logger.warn(
                    `${source}: quantity mismatch for order ${orderId} variant ` +
                        `${variantId} (local=${localQuantity}, erp=${erpQuantity}) — ERP wins, ` +
                        'local reservation released, difference reported',
                    loggerCtx,
                );
            }
            toRelease.push(...active.filter(r => r.productVariantId === variantId));
        }

        if (toRelease.length === 0) {
            return;
        }

        const releasedAt = new Date();
        for (const reservation of toRelease) {
            reservation.status = 'released';
            reservation.releasedAt = releasedAt;
            reservation.erpReleaseOperationId = randomUUID();
        }
        await reservationRepo.save(toRelease);
        Logger.log(
            `${source}: released ${toRelease.length} reservation(s) for order ` +
                `${orderId} — the ERP holds the stock now (no outbound event, ERP-driven)`,
            loggerCtx,
        );

        const stillActive = await reservationRepo.count({ where: { orderId, status: 'active' } });
        if (stillActive === 0) {
            await this.reservationService.setOrderReservationState(ctx, order, 'RELEASED');
        }
    }

    // Order.customFields.erpOrderId is declared by plugin-erp-order's module augmentation — raw
    // SQL sidesteps any doubt about whether that augmentation is visible through this plugin's
    // own tsc build, same established pattern as plugin-documents' findOrderIdByErpId.
    private async findOrderIdByErpId(orderEntityId: string): Promise<string | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT id FROM "order" WHERE "customFieldsErporderid" = $1 LIMIT 1`,
            [orderEntityId],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }

    // Order.customFieldsUuid (mivend#207, unique-indexed) — same raw-SQL pattern as
    // findOrderIdByErpId above, for the same module-augmentation-visibility reason.
    private async findOrderIdByUuid(orderUuid: string): Promise<string | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT id FROM "order" WHERE "customFieldsUuid" = $1 LIMIT 1`,
            [orderUuid],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }
}
