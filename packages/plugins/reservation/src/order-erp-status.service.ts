import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderStatusHistoryService, OrderStatusReferenceService } from '@mivend/plugin-erp-order';
import { withAggregateLock } from 'shared';

import { OrderCancelResultService } from './order-cancel-result.service';
import { loggerCtx } from './types';

// Fresh read under the order lock; write only changed keys so concurrent updates aren't clobbered.
// Cancelled must use the cancel-result path (local cancel + event), not a plain erpStatus write.
@Injectable()
export class OrderErpStatusService {
    constructor(
        private connection: TransactionalConnection,
        private orderCancelResult: OrderCancelResultService,
        private statusHistory: OrderStatusHistoryService,
        private statusReference: OrderStatusReferenceService,
    ) {}

    async apply(
        ctx: RequestContext,
        order: Order,
        derived: string | null,
        occurredAt: Date | null = null,
    ): Promise<void> {
        if (derived === null) return;
        if ((await this.statusReference.dictionary(ctx)).has(derived, 'cancelled')) {
            await this.cancel(ctx, order);
            return;
        }
        await withAggregateLock(this.connection, ctx, `reserve-order:${order.id}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, Order);
            const fresh = await repo.findOne({ where: { id: order.id } });
            if (!fresh || fresh.state === 'Cancelled') return;
            const dictionary = await this.statusReference.dictionary(txCtx);
            if (!dictionary.canAdvance(fresh.customFields.erpStatus, derived)) return;
            await repo.update(order.id, {
                customFields: { erpStatus: derived, erpStatusAt: new Date() },
            });
            await this.statusHistory.record(txCtx, order.id, derived, occurredAt);
        });
    }

    private async cancel(ctx: RequestContext, order: Order): Promise<void> {
        const orderUuid = order.customFields.uuid;
        if (!orderUuid) {
            Logger.warn(`order ${order.id} has no uuid, ERP cancellation skipped`, loggerCtx);
            return;
        }
        await this.orderCancelResult.apply(ctx, {
            orderUuid,
            status: 'cancelled',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    }
}
