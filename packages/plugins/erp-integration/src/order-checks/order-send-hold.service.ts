import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { OrderChecksService, ReservationService } from '@mivend/plugin-reservation';

const loggerCtx = 'OrderSendHold';

// `hold` at pre-send-to-erp stops an automatically reserved order from being sent; a manual
// confirmation is the staff release. A failing check never stops the send.
@Injectable()
export class OrderSendHoldService {
    constructor(
        private orderChecks: OrderChecksService,
        private reservations: ReservationService,
    ) {}

    async isHeld(ctx: RequestContext, orderId: string): Promise<boolean> {
        try {
            const { strongestConsequence } = await this.orderChecks.run(
                ctx,
                orderId,
                'pre-send-to-erp',
            );
            if (strongestConsequence !== 'hold') return false;
            const active = (await this.reservations.findForOrder(ctx, orderId)).filter(
                r => r.status === 'active',
            );
            return !active.some(r => r.creationMethod === 'manual');
        } catch (error) {
            Logger.error(`Order checks failed for order ${orderId}: ${String(error)}`, loggerCtx);
            return false;
        }
    }
}
