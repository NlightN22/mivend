import type { CancelOutcome } from './order-cancellation.service';

export type CancelOrderResult =
    | {
          __typename: 'CancelOrderSuccess';
          outcome: 'CANCELLED' | 'CANCEL_REQUESTED' | 'ALREADY_CANCELLED' | 'LEFT_TO_ERP';
      }
    | {
          __typename: 'CancelOrderRefused';
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

export function toCancelOrderResult(outcome: CancelOutcome): CancelOrderResult {
    switch (outcome.kind) {
        case 'cancelled':
            return { __typename: 'CancelOrderSuccess', outcome: 'CANCELLED' };
        case 'cancel-requested':
        case 'already-requested':
            return { __typename: 'CancelOrderSuccess', outcome: 'CANCEL_REQUESTED' };
        case 'already-cancelled':
            return { __typename: 'CancelOrderSuccess', outcome: 'ALREADY_CANCELLED' };
        case 'left-to-erp':
            return { __typename: 'CancelOrderSuccess', outcome: 'LEFT_TO_ERP' };
        case 'not-cancellable':
            return {
                __typename: 'CancelOrderRefused',
                reason: outcome.reason.toUpperCase().replace(/-/g, '_') as Extract<
                    CancelOrderResult,
                    { __typename: 'CancelOrderRefused' }
                >['reason'],
                message: REFUSAL_MESSAGES[outcome.reason],
            };
    }
}
