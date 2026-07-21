import { randomBytes } from 'crypto';

// Mirrors apps/server/src/order-code.strategy.ts's DateStampedOrderCodeStrategy exactly — the
// same generation principle applied to every internally-created business document number in this
// project that has no external-system reference to use instead (an ERP id, an acquirer RRN, a
// branch kassa receipt number — those always win when they exist, see e.g. PaymentAttempt.
// providerPaymentId). No DB read/write here on purpose — a MAX+1 query races under concurrent
// creation; year+month gives quick human orientation, the random suffix only needs to be
// practically collision-free, not strictly sequential.
export function generateDocumentCode(prefix: string, now: Date = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${year}${month}-${suffix}`;
}
