import { PaymentStatus } from './entities/payment-attempt.entity';

// A repeat delivery for an existing attempt only ever moves pending forward to captured.
export function shouldCapturePendingAttempt(
    existing: PaymentStatus,
    incoming: PaymentStatus,
): boolean {
    return existing === 'pending' && incoming === 'captured';
}
