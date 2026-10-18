import { describe, expect, it } from 'vitest';

import type { PaymentStatus } from '../../entities/payment-attempt.entity';
import { shouldCapturePendingAttempt } from '../../payment-status-transition';

describe('shouldCapturePendingAttempt', () => {
    it('captures a pending attempt on a captured delivery', () => {
        expect(shouldCapturePendingAttempt('pending', 'captured')).toBe(true);
    });

    it.each<[PaymentStatus, PaymentStatus]>([
        ['captured', 'captured'],
        ['captured', 'pending'],
        ['pending', 'pending'],
        ['pending', 'failed'],
        ['refunded', 'captured'],
        ['failed', 'captured'],
    ])('ignores %s -> %s', (existing, incoming) => {
        expect(shouldCapturePendingAttempt(existing, incoming)).toBe(false);
    });
});
