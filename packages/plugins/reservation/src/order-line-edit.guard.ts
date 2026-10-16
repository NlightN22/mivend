import { Injectable } from '@nestjs/common';
import { Order, RequestContext, UserInputError } from '@vendure/core';
import { OrderStatusReferenceService } from '@mivend/plugin-erp-order';

import { decideEdit, erpStageFacts } from './order-cancellation.decision';
import type { EditRefusal } from './order-cancellation.decision';
import { OrderCancellationPortRegistry } from './order-cancellation.port';
import { ReservationService } from './reservation.service';

const EDIT_REFUSALS: Record<EditRefusal, string> = {
    cancelled: 'The order is cancelled',
    shipped: 'The order has shipped',
    'in-progress': 'The warehouse has started on the order',
    'sent-to-erp': 'The order was already sent to the ERP; cancel it instead',
};

@Injectable()
export class OrderLineEditGuard {
    constructor(
        private statuses: OrderStatusReferenceService,
        private reservations: ReservationService,
        private cancelPorts: OrderCancellationPortRegistry,
    ) {}

    // Same stage facts as order cancellation (decideEdit). A reservation does not block an edit: it is
    // released here under the same lock, the order returns to the confirmation queue and staff re-confirm.
    async assertEditable(ctx: RequestContext, order: Order): Promise<void> {
        // A cart is not allocated yet and its placement transition may still be in flight (#233).
        if (order.active || order.state === 'Draft') {
            throw new UserInputError('The order is not placed yet');
        }
        if (order.customFields?.isExternal === true) {
            throw new UserInputError('Orders from the ERP are managed there');
        }
        const fields = order.customFields;
        const dictionary = await this.statuses.dictionary(ctx);
        const port = this.cancelPorts.get();
        const submission = fields.erpOrderId
            ? 'sent'
            : await port.submissionState(ctx, String(order.id));
        const verdict = decideEdit({
            orderState: order.state,
            erpStatus: erpStageFacts(dictionary, fields.erpStatus),
            erpOrderId: fields.erpOrderId ?? null,
            latestFulfillmentState: fields.latestFulfillmentState ?? null,
            hasSettledPayment: false,
            cancelRequestStatus: fields.cancelRequestStatus ?? null,
            submission,
            requestRegistered: true,
        });
        if (!verdict.allowed) throw new UserInputError(EDIT_REFUSALS[verdict.reason]);
        const rows = await this.reservations.findForOrder(ctx, order.id);
        if (!rows.some(r => r.status === 'active')) return;
        if (
            submission === 'pending' &&
            !(await port.skipPendingSubmission(
                ctx,
                String(order.id),
                'order lines edited before it was sent',
            ))
        ) {
            throw new UserInputError(EDIT_REFUSALS['sent-to-erp']);
        }
        await this.reservations.releaseReservations(ctx, order.id);
    }
}
