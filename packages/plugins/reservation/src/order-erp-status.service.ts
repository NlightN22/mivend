import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { canAdvanceErpStatus } from '@mivend/plugin-erp-order';
import type { ErpOrderStatus } from '@mivend/plugin-erp-order';
import { withAggregateLock } from 'shared';

import { OrderCancelResultService } from './order-cancel-result.service';
import { loggerCtx } from './types';

// Applies the status derived from order-changed facts. CANCELLED goes through the cancel-result
// path (local cancel + status event); any other status only moves erpStatus forward, decided on a
// fresh read under the order lock and written as changed keys only.
@Injectable()
export class OrderErpStatusService {
    constructor(
        private connection: TransactionalConnection,
        private orderCancelResult: OrderCancelResultService,
    ) {}

    async apply(ctx: RequestContext, order: Order, derived: ErpOrderStatus | null): Promise<void> {
        if (derived === null) return;
        if (derived === 'CANCELLED') {
            await this.cancel(ctx, order);
            return;
        }
        await withAggregateLock(this.connection, ctx, `reserve-order:${order.id}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, Order);
            const fresh = await repo.findOne({ where: { id: order.id } });
            if (!fresh || fresh.state === 'Cancelled') return;
            if (!canAdvanceErpStatus(fresh.customFields.erpStatus, derived)) return;
            await repo.update(order.id, {
                customFields: { erpStatus: derived, erpStatusAt: new Date() },
            });
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
