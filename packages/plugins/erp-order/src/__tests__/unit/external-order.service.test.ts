import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ExternalOrderService } from '../../external-order.service';
import type { ExternalOrderInput } from '../../external-order.types';

const ctx = {} as RequestContext;

function makeService(
    update: ReturnType<typeof vi.fn>,
    stored: { erpStatus: string | null; erpIsPosted: boolean | null } = {
        erpStatus: null,
        erpIsPosted: null,
    },
): ExternalOrderService {
    const dictionary = {
        codeWith: (flag: string) => (flag === 'cancelled' ? 'CANCELLED' : 'NEW'),
        vendureState: () => 'Shipped',
        has: (code: string | null, flag: string) => flag === 'cancelled' && code === 'CANCELLED',
        canAdvance: () => true,
    };
    const service = new ExternalOrderService(
        { getRepository: () => ({ update, query: vi.fn().mockResolvedValue([]) }) } as never,
        {} as never,
        { findByErpId: vi.fn().mockResolvedValue(null) } as never,
        { record: vi.fn() } as never,
        { dictionary: vi.fn().mockResolvedValue(dictionary) } as never,
    );
    const internals = service as unknown as Record<string, unknown>;
    internals.findByErpOrderId = vi
        .fn()
        .mockResolvedValue({ id: '1', isExternal: true, ...stored });
    internals.loadVariants = vi.fn().mockResolvedValue(new Map());
    internals.replaceLinesIfChanged = vi.fn();
    return service;
}

const input = {
    erpOrderId: 'erp-1',
    counterpartyErpId: null,
    erpStatus: 'SHIPPING',
    erpStatusAt: new Date('2026-01-02T03:04:05Z'),
    erpOrderStatus: 'x',
    documentNumber: null,
    contractId: null,
    orderDate: null,
    totalWithTaxMinor: 100,
    vatTotalMinor: null,
    amountIncludesVat: true,
    paidAmountMinor: null,
    lines: [],
    skippedLineCount: 0,
} satisfies ExternalOrderInput;

describe('ExternalOrderService status time', () => {
    it('writes erpStatusAt from the event time, not the write time', async () => {
        const update = vi.fn();
        const service = makeService(update);
        const apply = (
            service as unknown as {
                apply: (c: RequestContext, i: ExternalOrderInput) => Promise<unknown>;
            }
        ).apply.bind(service);
        await apply(ctx, input);
        const customFields = update.mock.calls[0][1].customFields;
        expect(customFields.erpStatusAt).toEqual(input.erpStatusAt);
    });

    describe('is_posted', () => {
        const run = async (
            stored: { erpStatus: string | null; erpIsPosted: boolean | null },
            patch: Partial<ExternalOrderInput>,
            times = 1,
        ): Promise<Array<Record<string, unknown>>> => {
            const update = vi.fn();
            const service = makeService(update, stored);
            const apply = (
                service as unknown as {
                    apply: (c: RequestContext, i: ExternalOrderInput) => Promise<unknown>;
                }
            ).apply.bind(service);
            for (let n = 0; n < times; n += 1) {
                await apply(ctx, { ...input, erpStatus: null, ...patch });
            }
            return update.mock.calls.map(call => call[1].customFields);
        };

        it('posted to not posted: stores the fact and cancels', async () => {
            const [fields] = await run(
                { erpStatus: 'SHIPPING', erpIsPosted: true },
                { isPosted: false },
            );
            expect(fields).toMatchObject({ erpIsPosted: false, erpStatus: 'CANCELLED' });
        });

        it('not posted to posted: reopens to the derived status, or the default without one', async () => {
            const stored = { erpStatus: 'CANCELLED', erpIsPosted: false };
            const [derived] = await run(stored, { isPosted: true, erpStatus: 'SHIPPING' });
            expect(derived).toMatchObject({ erpIsPosted: true, erpStatus: 'SHIPPING' });
            const [fallback] = await run(stored, { isPosted: true });
            expect(fallback).toMatchObject({ erpIsPosted: true, erpStatus: 'NEW' });
        });

        it('a genuine ERP cancellation stays cancelled when the order is posted', async () => {
            const [fields] = await run(
                { erpStatus: 'CANCELLED', erpIsPosted: true },
                { isPosted: true, erpStatus: 'SHIPPING' },
            );
            expect(fields).toMatchObject({ erpIsPosted: true });
            expect(fields).not.toHaveProperty('erpStatus');
        });

        it('the same not-posted event twice has one effect', async () => {
            const [first, second] = await run(
                { erpStatus: 'CANCELLED', erpIsPosted: false },
                { isPosted: false },
                2,
            );
            expect(second).toEqual(first);
            expect(first).not.toHaveProperty('erpStatus');
        });

        it('an event without is_posted leaves the fact and the status rules alone', async () => {
            const [fields] = await run({ erpStatus: 'CANCELLED', erpIsPosted: false }, {});
            expect(fields).not.toHaveProperty('erpIsPosted');
            expect(fields).not.toHaveProperty('erpStatus');
        });
    });
});
