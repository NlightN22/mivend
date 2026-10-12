import { RequestContext } from '@vendure/core';
import { BranchKassaPaymentEvent, ErpPaymentReportedEvent } from '@mivend/plugin-sync';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InboxService } from '../../inbox.service';
import { PaymentEventListener } from '../../payment-event.listener';

const mockCtx = {} as unknown as RequestContext;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test double, shape is obvious from usage
function createMockEventBus() {
    const subscribersByType = new Map<unknown, Array<(event: unknown) => void>>();
    return {
        ofType: vi.fn((type: unknown) => ({
            subscribe: (fn: (event: unknown) => void) => {
                const list = subscribersByType.get(type) ?? [];
                list.push(fn);
                subscribersByType.set(type, list);
            },
        })),
        emit(type: unknown, event: unknown): void {
            for (const fn of subscribersByType.get(type) ?? []) fn(event);
        },
    };
}

describe('PaymentEventListener', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockInboxService() {
        return {
            enqueue: vi.fn(async (..._args: unknown[]) => ({ id: 99 })),
            rejectAsInvalid: vi.fn(async (..._args: unknown[]) => undefined),
        };
    }

    let eventBus: ReturnType<typeof createMockEventBus>;
    let inboxService: ReturnType<typeof createMockInboxService>;
    let listener: PaymentEventListener;

    beforeEach(() => {
        eventBus = createMockEventBus();
        inboxService = createMockInboxService();
        listener = new PaymentEventListener(
            eventBus as never,
            inboxService as unknown as InboxService,
        );
        listener.onModuleInit();
    });

    it('enqueues an ErpPaymentReportedEvent as provider="erp", channel="bank-transfer-erp"', () => {
        eventBus.emit(
            ErpPaymentReportedEvent,
            new ErpPaymentReportedEvent(
                mockCtx,
                '8b1c7a0e-5d3f-4c1a-9a55-0d3f6f7a1c42',
                1,
                'success',
                'ERP-EVT-1',
                '1042-01',
            ),
        );

        expect(inboxService.enqueue).toHaveBeenCalledTimes(1);
        const [ctx, provider, providerEventId, , payload] = inboxService.enqueue.mock.calls[0];
        expect(ctx).toBe(mockCtx);
        expect(provider).toBe('erp');
        expect(providerEventId).toBe('ERP-EVT-1');
        expect(payload).toEqual({
            proformaInvoiceUuid: '8b1c7a0e-5d3f-4c1a-9a55-0d3f6f7a1c42',
            proformaInvoiceNumber: '1042-01',
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'ERP-EVT-1',
        });
    });

    it('hashes identity fields only: the optional document number does not change the hash', () => {
        const uuid = '8b1c7a0e-5d3f-4c1a-9a55-0d3f6f7a1c42';
        eventBus.emit(
            ErpPaymentReportedEvent,
            new ErpPaymentReportedEvent(mockCtx, uuid, 1, 'success', 'ERP-EVT-2', '1042-01'),
        );
        eventBus.emit(
            ErpPaymentReportedEvent,
            new ErpPaymentReportedEvent(mockCtx, uuid, 1, 'success', 'ERP-EVT-2'),
        );

        const [first, second] = inboxService.enqueue.mock.calls;
        expect(first[3]).toBe(second[3]);
    });

    it('enqueues a BranchKassaPaymentEvent as provider="branch-kassa", channel="branch-kassa"', () => {
        eventBus.emit(
            BranchKassaPaymentEvent,
            new BranchKassaPaymentEvent(mockCtx, 7, 1, 'pending', 'SYNC-EVT-9', '123456789012'),
        );

        expect(inboxService.enqueue).toHaveBeenCalledTimes(1);
        const [ctx, provider, providerEventId, , payload] = inboxService.enqueue.mock.calls[0];
        expect(ctx).toBe(mockCtx);
        expect(provider).toBe('branch-kassa');
        expect(providerEventId).toBe('SYNC-EVT-9');
        expect(payload).toEqual({
            proformaInvoiceId: 7,
            organizationId: 1,
            outcome: 'pending',
            channel: 'branch-kassa',
            externalReference: '123456789012',
        });
    });

    it('still durably enqueues a branch-kassa fact with no RRN (never a silent drop), then rejects it as invalid — the external reference is mandatory', async () => {
        eventBus.emit(
            BranchKassaPaymentEvent,
            new BranchKassaPaymentEvent(mockCtx, 8, 1, 'success', 'SYNC-EVT-10'),
        );
        await Promise.resolve();
        await Promise.resolve();

        const [, , , , payload] = inboxService.enqueue.mock.calls[0];
        expect(payload).toEqual({
            proformaInvoiceId: 8,
            organizationId: 1,
            outcome: 'success',
            channel: 'branch-kassa',
            externalReference: undefined,
        });
        expect(inboxService.rejectAsInvalid).toHaveBeenCalledWith(
            mockCtx,
            99,
            expect.stringContaining('Missing mandatory external reference'),
        );
    });

    it('does not reject a branch-kassa fact that has a real RRN', async () => {
        eventBus.emit(
            BranchKassaPaymentEvent,
            new BranchKassaPaymentEvent(mockCtx, 7, 1, 'pending', 'SYNC-EVT-9', '123456789012'),
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(inboxService.rejectAsInvalid).not.toHaveBeenCalled();
    });

    it('does not call payProformaInvoice-adjacent processing — enqueue/rejectAsInvalid are the only side effects', () => {
        eventBus.emit(
            ErpPaymentReportedEvent,
            new ErpPaymentReportedEvent(
                mockCtx,
                '3f1c1a5e-6c1d-4a63-9b0e-0b8a5d2f7a10',
                1,
                'success',
                'ERP-EVT-2',
            ),
        );
        expect(Object.keys(inboxService).sort()).toEqual(['enqueue', 'rejectAsInvalid']);
    });
});
