import { describe, expect, it } from 'vitest';

import type { PaymentStatus } from '../../entities/payment-attempt.entity';
import { shouldResolvePendingAttempt } from '../../payment-status-transition';

describe('shouldResolvePendingAttempt', () => {
    it.each<PaymentStatus>(['captured', 'failed', 'canceled'])(
        'resolves a pending attempt to %s',
        incoming => {
            expect(shouldResolvePendingAttempt('pending', incoming)).toBe(true);
        },
    );

    it.each<[PaymentStatus, PaymentStatus]>([
        ['captured', 'captured'],
        ['captured', 'pending'],
        ['captured', 'failed'],
        ['pending', 'pending'],
        ['failed', 'captured'],
        ['canceled', 'captured'],
        ['refunded', 'captured'],
    ])('ignores %s -> %s', (existing, incoming) => {
        expect(shouldResolvePendingAttempt(existing, incoming)).toBe(false);
    });
});
