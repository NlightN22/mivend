import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { In } from 'typeorm';
import { EventBus, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { ErpOrderStatusEvent, OrderStatusReferenceService } from '@mivend/plugin-erp-order';

import { ErpOrderReserveService } from './erp-order-reserve.service';
import { OrderErpStatusService } from './order-erp-status.service';
import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssueService } from './reservation-reconciliation-issue.service';
import { ReservationService } from './reservation.service';
import { UnknownOrderUuidError } from './reservation-errors';
import { loggerCtx } from './types';
import type {
    OrderChangedInput,
    OrderRegistrationResultInput,
} from './reservation-write-off-sync.types';

export type {
    OrderChangedInput,
    OrderRegistrationResultInput,
} from './reservation-write-off-sync.types';
import { withAggregateLock, withOrderCancelLocks, ctxQuery } from 'shared';

// Bridges erp.order.events.v1 `registration-result` and `changed` into the reservation domain (#75).
// Never publishes ReservationReleasedEvent: that would send a release command back to the ERP that just wrote off.
@Injectable()
export class ReservationWriteOffSyncService {
    constructor(
        private connection: TransactionalConnection,
        private reservationService: ReservationService,
        private reconciliationIssueService: ReservationReconciliationIssueService,
        private eventBus: EventBus,
        private orderErpStatus: OrderErpStatusService,
        private statuses: OrderStatusReferenceService,
        private erpReserve: ErpOrderReserveService,
    ) {}

    async handleOrderRegistrationResult(
        ctx: RequestContext,
        input: OrderRegistrationResultInput,
    ): Promise<void> {
        // Correlation order: orderUuid (mivend#207), localOrderId, then orderEntityId.
        const orderId = input.orderUuid
            ? await this.findOrderIdByUuid(ctx, input.orderUuid)
            : input.localOrderId
              ? input.localOrderId
              : input.orderEntityId
                ? await this.findOrderIdByErpId(ctx, input.orderEntityId)
                : null;
        if (!orderId) {
            // Never a silent skip: a distinguishable error lets the inbox retry (#211).
            throw new UnknownOrderUuidError(
                `order-registration-result: no Order found via orderUuid=${input.orderUuid ?? ''}, ` +
                    `requestEntityId=${input.requestEntityId ?? ''} or orderEntityId=${input.orderEntityId ?? ''}`,
            );
        }
        // Same lock as reserveOrder and the cancel service: whether the order counts as registered
        // is decided against a fact written under it (#194).
        await withAggregateLock(this.connection, ctx, `reserve-order:${orderId}`, txCtx =>
            this.applyRegistrationResult(txCtx, orderId, input),
        );
    }

    private async applyRegistrationResult(
        ctx: RequestContext,
        orderId: string,
        input: OrderRegistrationResultInput,
    ): Promise<void> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: orderId } });
        if (!order) {
            throw new UnknownOrderUuidError(
                `order-registration-result: Order ${orderId} not found (orderUuid=${input.orderUuid ?? ''})`,
            );
        }

        // REJECTED is non-terminal (#204): a later non-rejected result clears the reason fields.
        const dictionary = await this.statuses.dictionary(ctx);
        const wasRejected = dictionary.has(order.customFields.erpStatus, 'rejected');
        const wasPending =
            order.customFields.erpStatus == null ||
            dictionary.has(order.customFields.erpStatus, 'initial');
        const missingErpOrderId = !order.customFields.erpOrderId && !!input.orderEntityId;

        const customFields: Partial<typeof order.customFields> = {
            erpRegistrationStatus: input.status,
        };
        if (input.documentNumber) {
            customFields.erpRegistrationDocumentNumber = input.documentNumber;
        }
        if (missingErpOrderId && !input.rejected) {
            customFields.erpOrderId = input.orderEntityId;
        }
        if (input.rejected) {
            customFields.erpRejectionReasonCode = input.rejectionReasonCode;
            customFields.erpRejectionReasonText = input.rejectionReasonText;
        } else if (wasRejected) {
            customFields.erpRejectionReasonCode = null;
            customFields.erpRejectionReasonText = null;
        }
        // Changed fields only via repo.update(): a full snapshot would erase a concurrent write.
        await this.connection.getRepository(ctx, Order).update(order.id, { customFields });
        order.customFields = { ...order.customFields, ...customFields };

        // erpStatus is owned by plugin-erp-order's ErpOrderService.updateStatus.
        if (input.rejected) {
            this.eventBus.publish(
                new ErpOrderStatusEvent(ctx, order.code, dictionary.codeWith('rejected')),
            );
        } else if (wasRejected || wasPending || missingErpOrderId) {
            // Carries orderEntityId so updateStatus stores erpOrderId, the later correlation key.
            this.eventBus.publish(
                new ErpOrderStatusEvent(
                    ctx,
                    order.code,
                    dictionary.codeWith('submitted'),
                    input.orderEntityId ?? undefined,
                ),
            );
        }

        if (input.unresolvedProductIds.length > 0) {
            for (const externalProductId of input.unresolvedProductIds) {
                await this.reconciliationIssueService.reportUnresolvedProductMapping(ctx, {
                    orderId,
                    externalProductId,
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
            // Never release on a rejection: the ERP resolves it (re-post, correction or CANCELLED).
            Logger.warn(
                `order-registration-result: order ${orderId} (erp ${input.orderEntityId ?? ''}) was ` +
                    'rejected by the ERP — leaving reservations active',
                loggerCtx,
            );
            return;
        }

        await this.erpReserve.record(
            ctx,
            orderId,
            input.reservedLines,
            null,
            !input.linesDiscarded,
        );
        await this.releaseMatchingReservations(
            ctx,
            orderId,
            order,
            input.reservedLines,
            input.orderEntityId ?? '',
            'order-registration-result',
        );
    }

    // #110: release matching is shared with the registration result via releaseMatchingReservations.
    async handleOrderChanged(ctx: RequestContext, input: OrderChangedInput): Promise<void> {
        // Orders not registered through our integration carry no orderUuid.
        const orderId = input.orderUuid
            ? await this.findOrderIdByUuid(ctx, input.orderUuid)
            : await this.findOrderIdByErpId(ctx, input.orderEntityId);
        if (!orderId) {
            // Same retryable error as handleOrderRegistrationResult (#211).
            throw new UnknownOrderUuidError(
                `order-changed: no Order found via orderUuid=${input.orderUuid ?? ''} or ` +
                    `orderEntityId=${input.orderEntityId}`,
            );
        }
        // The cancel locks: a cancelled derived status cancels the order inside this transaction.
        await withOrderCancelLocks(this.connection, ctx, orderId, txCtx =>
            this.applyOrderChanged(txCtx, orderId, input),
        );
    }

    private async applyOrderChanged(
        ctx: RequestContext,
        orderId: string,
        input: OrderChangedInput,
    ): Promise<void> {
        const order = await this.connection
            .getRepository(ctx, Order)
            .findOne({ where: { id: orderId } });
        if (!order) {
            throw new UnknownOrderUuidError(`order-changed: Order ${orderId} not found`);
        }

        const customFields: Partial<typeof order.customFields> = {
            erpOrderStatus: input.status,
        };
        if (input.contractId !== null) {
            // An absent contractId on a later event never overwrites a known one.
            customFields.erpContractId = input.contractId;
        }
        if (input.documentNumber) {
            customFields.erpRegistrationDocumentNumber = input.documentNumber;
        }
        if (input.paidAmountMinor != null) {
            customFields.erpPaidAmount = input.paidAmountMinor;
        }
        await this.connection.getRepository(ctx, Order).update(order.id, { customFields });
        order.customFields = { ...order.customFields, ...customFields };

        await this.orderErpStatus.apply(
            ctx,
            order,
            input.derivedStatus,
            input.derivedStatusAt ?? null,
        );

        await this.erpReserve.record(
            ctx,
            orderId,
            input.reservedLines,
            input.reserveUntil ?? null,
            !input.linesDiscarded,
        );
        await this.releaseMatchingReservations(
            ctx,
            orderId,
            order,
            input.reservedLines,
            input.orderEntityId,
            'order-changed',
            (await this.statuses.dictionary(ctx)).has(input.derivedStatus, 'warehouseStarted'),
        );
    }

    private async releaseMatchingReservations(
        ctx: RequestContext,
        orderId: string,
        order: Order,
        reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>,
        orderEntityId: string,
        source: 'order-registration-result' | 'order-changed',
        warehouseOrderExists = false,
    ): Promise<void> {
        const reservationRepo = this.connection.getRepository(ctx, Reservation);
        const held = await reservationRepo.find({
            where: { orderId, status: In(['active', 'released']) },
        });
        const active = held.filter(r => r.status === 'active');
        if (active.length === 0) {
            return;
        }

        // Per variant, not per row: the ERP reports one quantity per product, an order may have two lines of it.
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

        const handedOver = new Map<string, number>();
        const currentGeneration = Math.max(0, ...active.map(r => r.reservationGeneration ?? 1));
        // A hand-over from an earlier cycle (cancelled, then re-reserved) is not part of this one.
        for (const reservation of held.filter(
            r => r.erpHandedOverAt != null && (r.reservationGeneration ?? 1) === currentGeneration,
        )) {
            handedOver.set(
                reservation.productVariantId,
                (handedOver.get(reservation.productVariantId) ?? 0) + reservation.quantity,
            );
        }

        const releasedAt = new Date();
        const toRelease: Reservation[] = [];
        let partialCount = 0;
        for (const [variantId, localQuantity] of localQuantityByVariant) {
            const erpQuantity = erpQuantityByVariant.get(variantId);
            if (erpQuantity === undefined) {
                // Not confirmed in this result — leave active, may arrive in a later document.
                continue;
            }
            const alreadyHandedOver = handedOver.get(variantId) ?? 0;
            const required = localQuantity + alreadyHandedOver;
            // Once a warehouse order exists the ERP may have closed the reserve; zero is normal.
            const closedByOrderScheme = warehouseOrderExists && erpQuantity === 0;
            if (erpQuantity !== required && !closedByOrderScheme) {
                await this.reconciliationIssueService.reportQuantityMismatch(ctx, {
                    orderId,
                    productVariantId: variantId,
                    localQuantity: required,
                    erpQuantity,
                    orderEntityId,
                });
                Logger.warn(
                    `${source}: quantity mismatch for order ${orderId} variant ${variantId} ` +
                        `(local=${required}, erp=${erpQuantity}) — local reserve kept for the ` +
                        'part the ERP does not hold',
                    loggerCtx,
                );
            }
            const rows = active.filter(r => r.productVariantId === variantId);
            let covered =
                closedByOrderScheme || erpQuantity >= required
                    ? localQuantity
                    : Math.max(0, erpQuantity - alreadyHandedOver);
            for (const row of rows) {
                if (covered <= 0) {
                    break;
                }
                if (row.quantity <= covered) {
                    covered -= row.quantity;
                    row.status = 'released';
                    row.releasedAt = releasedAt;
                    row.erpHandedOverAt = releasedAt;
                    row.erpReleaseOperationId = randomUUID();
                    toRelease.push(row);
                } else {
                    await reservationRepo.save(
                        new Reservation({
                            orderId: row.orderId,
                            orderLineId: row.orderLineId,
                            productVariantId: row.productVariantId,
                            stockLocationId: row.stockLocationId,
                            branchId: row.branchId,
                            reservedAt: row.reservedAt,
                            expiresAt: row.expiresAt,
                            reservationGeneration: row.reservationGeneration,
                            creationMethod: row.creationMethod,
                            quantity: covered,
                            status: 'released',
                            releasedAt,
                            erpHandedOverAt: releasedAt,
                            erpOperationId: randomUUID(),
                            erpReleaseOperationId: randomUUID(),
                        }),
                    );
                    row.quantity -= covered;
                    covered = 0;
                    await reservationRepo.save(row);
                    partialCount++;
                }
            }
        }

        if (toRelease.length > 0) {
            await reservationRepo.save(toRelease);
        }
        const releasedCount = toRelease.length + partialCount;
        if (releasedCount === 0) {
            return;
        }
        Logger.log(
            `${source}: released ${releasedCount} reservation(s) for order ` +
                `${orderId} — the ERP holds the stock now (no outbound event, ERP-driven)`,
            loggerCtx,
        );

        const stillActive = await reservationRepo.count({ where: { orderId, status: 'active' } });
        if (stillActive === 0) {
            await this.reservationService.setOrderReservationState(ctx, order, 'RELEASED');
        }
    }

    // Raw SQL: plugin-erp-order's customField augmentation is not visible to this plugin's tsc build.
    private async findOrderIdByErpId(
        ctx: RequestContext,
        orderEntityId: string,
    ): Promise<string | null> {
        const result = await ctxQuery<Array<{ id: string | number | null }>>(
            this.connection,
            ctx,
            `SELECT id FROM "order" WHERE "customFieldsErporderid" = $1 LIMIT 1`,
            [orderEntityId],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }

    private async findOrderIdByUuid(
        ctx: RequestContext,
        orderUuid: string,
    ): Promise<string | null> {
        const result = await ctxQuery<Array<{ id: string | number | null }>>(
            this.connection,
            ctx,
            `SELECT id FROM "order" WHERE "customFieldsUuid" = $1 LIMIT 1`,
            [orderUuid],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }
}
