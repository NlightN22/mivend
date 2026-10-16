import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { OrderChecksService, ReservationService } from '@mivend/plugin-reservation';

export const HELD_SKIP_REASON = 'held by an order check policy (pre-send-to-erp)';

// `hold` at pre-send-to-erp stops an automatically reserved order from being sent; a manual
// confirmation is the staff release. Fail-open by owner decision (docs/checks-and-policies.md).
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
            return !active.some(r => r.creationMethod === 'manual' || r.confirmedByAdministratorId);
        } catch (error) {
            await this.orderChecks.recordFailure(orderId, 'pre-send-to-erp', error);
            return false;
        }
    }
}
