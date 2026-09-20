import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssueService } from './reservation-reconciliation-issue.service';
import { ReservationService } from './reservation.service';
import { loggerCtx } from './types';

export interface OrderRegistrationResultInput {
    orderEntityId: string | null;
    rejected: boolean;
    // Already resolved from 1C's productId to a Vendure ProductVariant id by the caller
    // (erp-integration's OrderRegistrationResultHandler) — this service stays free of the
    // Kafka/protobuf decode concern, same split as ReservationErpSyncService.
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    // 1C productIds from reservedLines that the caller could NOT resolve to a ProductVariant at
    // all — reported as a distinct ReservationReconciliationIssue (mivend.audit.72's HIGH
    // finding), never silently folded into "not confirmed in this result yet."
    unresolvedProductIds: string[];
    // Staff-facing informational fields, persisted onto Order.customFields — never used in any
    // release/quantity-match decision below. documentNumber is a real proto `optional string`
    // (null means genuinely absent); status is a plain proto3 string ('' means absent, per the
    // zero-value-omission rule — see external-integration-rules skill).
    documentNumber: string | null;
    status: string;
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
    orderEntityId: string;
    // Plain proto3 string — '' means absent (zero-value-omission rule), passed through verbatim.
    status: string;
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    // Real proto `optional string` — null means genuinely not sent, not a zero-value.
    contractId: string | null;
}

// Bridges company.orders.events.v1.order-registration-result into the local reservation domain
// (issue #75, the real release trigger ReservationErpSyncService's own doc comment defers to).
// This event is emitted as a direct, same-transaction consequence of 1C actually posting the
// order document — genuinely stronger evidence than the generic order-status callback's bare
// RESERVED/CONFIRMED labels, so this is the one place allowed to release a reservation before a
// terminal CANCELLED.
//
// Deliberately never publishes ReservationReleasedEvent: that event drives an outbound "please
// release" command back to 1C (see plugin-sync's ReservationConsumer) — sending it right after
// 1C itself just confirmed the write-off would be backwards, same reasoning as the abandoned
// stockAllocated-bridge attempt this issue's history already worked through.
@Injectable()
export class ReservationWriteOffSyncService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
        private reconciliationIssueService: ReservationReconciliationIssueService,
    ) {}

    async handleOrderRegistrationResult(
        ctx: RequestContext,
        input: OrderRegistrationResultInput,
    ): Promise<void> {
        if (!input.orderEntityId) {
            // A rejected result may carry no order_entity_id at all (no order was ever created) —
            // nothing to correlate to, not an error.
            Logger.verbose('order-registration-result: no orderEntityId, skipping', loggerCtx);
            return;
        }

        const orderId = await this.findOrderIdByErpId(input.orderEntityId);
        const order = orderId
            ? await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId } })
            : null;
        if (!orderId || !order) {
            // mivend.audit.72's LOW finding: never a silent, permanent skip — this order-
            // registration-result event is a one-shot fact (unlike the catalog streams, it never
            // arrives again at a higher version for the same entityId), so if Order.customFields
            // .erpOrderId simply hasn't been set yet (a plausible race between this Kafka event
            // and the order-status REST callback that sets it), swallowing it here would lose the
            // release trigger for this order forever. Throwing lets the existing inbox
            // retry/backoff (IntegrationInboxService.markFailed) retry on the next sweep, and
            // dead-letter (visible, not silent) only once genuinely exhausted.
            throw new Error(
                `order-registration-result: no Order found for orderEntityId=${input.orderEntityId}`,
            );
        }

        // Always persist the latest known document number/status, regardless of rejected/
        // released/no-op below — purely informational for staff, never read by the
        // release/quantity-match logic that follows.
        order.customFields.erpRegistrationDocumentNumber = input.documentNumber;
        order.customFields.erpRegistrationStatus = input.status;
        await this.connection.getRepository(ctx, Order).save(order);

        if (input.unresolvedProductIds.length > 0) {
            for (const externalProductId of input.unresolvedProductIds) {
                await this.reconciliationIssueService.reportUnresolvedProductMapping(ctx, {
                    orderId,
                    externalProductId,
                    orderEntityId: input.orderEntityId,
                });
            }
            Logger.error(
                `order-registration-result: order ${orderId} (erp ${input.orderEntityId}) — ` +
                    `${input.unresolvedProductIds.length} productId(s) could not be resolved to a ` +
                    'ProductVariant, reported for staff follow-up',
                loggerCtx,
            );
        }

        if (input.rejected) {
            // Never release on a rejection — per the user's own framing, 1C will eventually
            // resolve the underlying document one way or the other (re-post, manual correction,
            // or a genuine CANCELLED, which ReservationErpSyncService already handles).
            Logger.warn(
                `order-registration-result: order ${orderId} (erp ${input.orderEntityId}) was ` +
                    'rejected by 1C — leaving reservations active',
                loggerCtx,
            );
            return;
        }

        await this.releaseMatchingReservations(
            ctx,
            orderId,
            order,
            input.reservedLines,
            input.orderEntityId,
            'order-registration-result',
        );
    }

    // Issue #110: bridges company.orders.events.v1.order-changed. Only the FK resolve (entityId
    // → productId, both handled by the caller, erp-integration's OrderChangedStreamHandler) and
    // the informational customFields differ from handleOrderRegistrationResult above — the actual
    // release-matching logic is shared via releaseMatchingReservations, see OrderChangedInput's
    // own doc comment for why reuse is safe here.
    async handleOrderChanged(ctx: RequestContext, input: OrderChangedInput): Promise<void> {
        const orderId = await this.findOrderIdByErpId(input.orderEntityId);
        const order = orderId
            ? await this.connection.getRepository(ctx, Order).findOne({ where: { id: orderId } })
            : null;
        if (!orderId || !order) {
            // Same cross-entity-dependency retry rule as handleOrderRegistrationResult above
            // (external-integration-rules skill): an order-changed event can race ahead of local
            // order creation — never a silent, permanent skip.
            throw new Error(
                `order-changed: no Order found for orderEntityId=${input.orderEntityId}`,
            );
        }

        order.customFields.erpOrderStatus = input.status;
        if (input.contractId !== null) {
            // Real optional presence: an absent contractId on a later event does not mean the
            // order lost its contract — never overwrite an already-known value with null.
            order.customFields.erpContractId = input.contractId;
        }
        await this.connection.getRepository(ctx, Order).save(order);

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
        // reservations for the same variant (two order lines), while 1C reports one confirmed
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
            if (erpQuantity === localQuantity) {
                toRelease.push(...active.filter(r => r.productVariantId === variantId));
            } else {
                await this.reconciliationIssueService.reportQuantityMismatch(ctx, {
                    orderId,
                    productVariantId: variantId,
                    localQuantity,
                    erpQuantity,
                    orderEntityId,
                });
                Logger.error(
                    `${source}: quantity mismatch for order ${orderId} variant ` +
                        `${variantId} (local=${localQuantity}, erp=${erpQuantity}) — reported, ` +
                        'reservation left active',
                    loggerCtx,
                );
            }
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
                `${orderId} — confirmed write-off matched (no outbound event, 1C-driven)`,
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
}
