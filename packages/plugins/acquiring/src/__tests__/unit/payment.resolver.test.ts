import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { IncomingPaymentEvent } from '../../entities/incoming-payment-event.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { InboxService } from '../../inbox.service';
import { PaymentFieldResolver } from '../../payment.resolver';

const mockCtx = {} as unknown as RequestContext;

function makePayment(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
    return {
        id: 1,
        channel: 'bank-transfer-erp',
        providerPaymentId: 'ERP-EVT-1',
        ...overrides,
    } as PaymentAttempt;
}

function makeEvent(overrides: Partial<IncomingPaymentEvent> = {}): IncomingPaymentEvent {
    return {
        id: 5,
        provider: 'erp',
        providerEventId: 'ERP-EVT-1',
        status: 'pending',
        attempts: 0,
        lastError: null,
        processedAt: null,
        createdAt: new Date('2026-07-01T10:00:00Z'),
        updatedAt: new Date('2026-07-01T10:00:00Z'),
        ...overrides,
    } as IncomingPaymentEvent;
}

describe('PaymentFieldResolver.processingEvents', () => {
    function makeResolver(inboxService: Partial<InboxService>): PaymentFieldResolver {
        return new PaymentFieldResolver(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            inboxService as InboxService,
        );
    }

    it('returns an empty list for online-acquiring — no inbox event exists for that channel', async () => {
        const findByProviderAndEventId = vi.fn();
        const resolver = makeResolver({ findByProviderAndEventId });

        const result = await resolver.processingEvents(
            mockCtx,
            makePayment({ channel: 'online-acquiring' }),
        );

        expect(result).toEqual([]);
        expect(findByProviderAndEventId).not.toHaveBeenCalled();
    });

    it('returns an empty list when no matching inbox event is found', async () => {
        const resolver = makeResolver({
            findByProviderAndEventId: vi.fn(async () => null),
        });

        const result = await resolver.processingEvents(mockCtx, makePayment());

        expect(result).toEqual([]);
    });

    it('returns only "Received" for a still-pending event with no attempts yet', async () => {
        const resolver = makeResolver({
            findByProviderAndEventId: vi.fn(async () => makeEvent()),
        });

        const result = await resolver.processingEvents(mockCtx, makePayment());

        expect(result).toEqual([{ stage: 'Received', occurredAt: expect.any(Date), note: null }]);
    });

    it('adds "Processed" once the event completed successfully', async () => {
        const processedAt = new Date('2026-07-01T10:05:00Z');
        const resolver = makeResolver({
            findByProviderAndEventId: vi.fn(async () =>
                makeEvent({ status: 'processed', attempts: 1, processedAt }),
            ),
        });

        const result = await resolver.processingEvents(mockCtx, makePayment());

        expect(result.map(s => s.stage)).toEqual(['Received', 'Processing', 'Processed']);
        expect(result[2].occurredAt).toBe(processedAt);
    });

    it('surfaces the real lastError note when the event dead-lettered', async () => {
        const resolver = makeResolver({
            findByProviderAndEventId: vi.fn(async () =>
                makeEvent({ status: 'failed', attempts: 5, lastError: 'Invoice 42 not found' }),
            ),
        });

        const result = await resolver.processingEvents(mockCtx, makePayment());

        expect(result.map(s => s.stage)).toEqual(['Received', 'Processing', 'Failed']);
        expect(result[2].note).toBe('Invoice 42 not found');
    });

    it('looks up branch-kassa events under provider="branch-kassa"', async () => {
        const findByProviderAndEventId = vi.fn(async () => null);
        const resolver = makeResolver({ findByProviderAndEventId });

        await resolver.processingEvents(
            mockCtx,
            makePayment({ channel: 'branch-kassa', providerPaymentId: '123456789012' }),
        );

        expect(findByProviderAndEventId).toHaveBeenCalledWith(
            mockCtx,
            'branch-kassa',
            '123456789012',
        );
    });
});
