import { PaymentStatus } from './entities/payment-attempt.entity';

const PENDING_RESOLUTIONS: readonly PaymentStatus[] = ['captured', 'failed', 'canceled'];

// A repeat delivery for an existing attempt only ever resolves a pending one, never rewinds it.
export function shouldResolvePendingAttempt(
    existing: PaymentStatus,
    incoming: PaymentStatus,
): boolean {
    return existing === 'pending' && PENDING_RESOLUTIONS.includes(incoming);
}
