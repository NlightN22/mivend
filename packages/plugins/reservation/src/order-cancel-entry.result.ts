import type { CancelOutcome } from './order-cancellation.service';

export type OrderCancelResult =
    | {
          __typename: 'OrderCancelSuccess';
          outcome: 'CANCELLED' | 'CANCEL_REQUESTED' | 'ALREADY_CANCELLED' | 'LEFT_TO_ERP';
      }
    | {
          __typename: 'OrderCancelRefused';
          reason: 'SHIPPED' | 'IN_PROGRESS' | 'PAID' | 'REFUSED_BY_ERP' | 'REGISTRATION_REJECTED';
          message: string;
      };

const REFUSAL_MESSAGES = {
    shipped: 'The order has been shipped and can no longer be cancelled.',
    'in-progress': 'The order is already being processed and cannot be cancelled.',
    paid: 'A paid order cannot be cancelled automatically.',
    'refused-by-erp': 'The cancellation was refused by the ERP.',
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
            return { __typename: 'OrderCancelSuccess', outcome: 'LEFT_TO_ERP' };
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
