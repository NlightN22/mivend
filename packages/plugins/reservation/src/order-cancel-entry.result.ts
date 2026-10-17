import type { CancelOutcome } from './order-cancellation.service';

export type OrderCancelResult =
    | {
          __typename: 'OrderCancelSuccess';
          outcome: 'CANCELLED' | 'CANCEL_REQUESTED' | 'ALREADY_CANCELLED';
      }
    | {
          __typename: 'OrderCancelRefused';
          reason: 'SHIPPED' | 'IN_PROGRESS' | 'PAID' | 'REGISTRATION_REJECTED';
          message: string;
      };

const REFUSAL_MESSAGES = {
    shipped: 'The order has been shipped and can no longer be cancelled.',
    'in-progress': 'The order is already being processed and cannot be cancelled.',
    paid: 'A paid order cannot be cancelled automatically.',
    'registration-rejected': 'The ERP rejected the order, so it cannot be cancelled this way.',
} as const;

export function toOrderCancelResult(outcome: CancelOutcome): OrderCancelResult {
    switch (outcome.kind) {
        case 'cancelled':
            return { __typename: 'OrderCancelSuccess', outcome: 'CANCELLED' };
        case 'cancel-requested':
        case 'already-requested':
            return { __typename: 'OrderCancelSuccess', outcome: 'CANCEL_REQUESTED' };
        case 'already-cancelled':
            return { __typename: 'OrderCancelSuccess', outcome: 'ALREADY_CANCELLED' };
        case 'left-to-erp':
            throw new Error('left-to-erp is only produced at the reserve deadline');
        case 'reserve-not-due':
            throw new Error('reserve-not-due is only produced at the reserve deadline');
        case 'not-cancellable':
            return {
                __typename: 'OrderCancelRefused',
                reason: outcome.reason.toUpperCase().replace(/-/g, '_') as Extract<
                    OrderCancelResult,
                    { __typename: 'OrderCancelRefused' }
                >['reason'],
                message: REFUSAL_MESSAGES[outcome.reason],
            };
    }
}
