import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ExternalOrderService } from '../../external-order.service';
import type { ExternalOrderInput } from '../../external-order.types';

const ctx = {} as RequestContext;

interface Stored {
    erpStatus: string | null;
    erpIsPosted: boolean | null;
    erpStatusBeforeUnposted: string | null;
}

function makeService(
    update: ReturnType<typeof vi.fn>,
    stored: Stored = {
        erpStatus: null,
        erpIsPosted: null,
        erpStatusBeforeUnposted: null,
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
        type Fields = Record<string, unknown>;
        const run = async (
            initial: Stored,
            events: Array<Partial<ExternalOrderInput>>,
        ): Promise<Fields[]> => {
            const update = vi.fn();
            let stored = { ...initial };
            const service = makeService(update, stored);
            const internals = service as unknown as Record<string, unknown>;
            const apply = (
                service as unknown as {
                    apply: (c: RequestContext, i: ExternalOrderInput) => Promise<unknown>;
                }
            ).apply.bind(service);
            const seen: Fields[] = [];
            for (const event of events) {
                internals.findByErpOrderId = vi
                    .fn()
                    .mockResolvedValue({ id: '1', isExternal: true, ...stored });
                await apply(ctx, { ...input, erpStatus: null, ...event });
                const fields = update.mock.calls.at(-1)?.[1].customFields as Fields;
                seen.push(fields);
                stored = {
                    erpStatus: (fields.erpStatus as string | undefined) ?? stored.erpStatus,
                    erpIsPosted:
                        'erpIsPosted' in fields
                            ? (fields.erpIsPosted as boolean | null)
                            : stored.erpIsPosted,
                    erpStatusBeforeUnposted:
                        'erpStatusBeforeUnposted' in fields
                            ? (fields.erpStatusBeforeUnposted as string | null)
                            : stored.erpStatusBeforeUnposted,
                };
            }
            return seen;
        };
        const posted = (erpStatus: string): Stored => ({
            erpStatus,
            erpIsPosted: true,
            erpStatusBeforeUnposted: null,
        });

        it('shipped, not posted, posted again restores shipped and clears the saved status', async () => {
            const [off, on] = await run(posted('SHIPPING'), [
                { isPosted: false },
                { isPosted: true },
            ]);
            expect(off).toMatchObject({
                erpIsPosted: false,
                erpStatus: 'CANCELLED',
                erpStatusBeforeUnposted: 'SHIPPING',
            });
            expect(on).toMatchObject({
                erpIsPosted: true,
                erpStatus: 'SHIPPING',
                erpStatusBeforeUnposted: null,
            });
        });

        it('posted again with nothing saved falls back to the incoming status, then the default', async () => {
            const stored = {
                erpStatus: 'CANCELLED',
                erpIsPosted: false,
                erpStatusBeforeUnposted: null,
            };
            const [derived] = await run(stored, [{ isPosted: true, erpStatus: 'SHIPPING' }]);
            expect(derived).toMatchObject({ erpIsPosted: true, erpStatus: 'SHIPPING' });
            const [fallback] = await run(stored, [{ isPosted: true }]);
            expect(fallback).toMatchObject({ erpIsPosted: true, erpStatus: 'NEW' });
        });

        it('not posted, then a genuine cancel, then posted stays cancelled', async () => {
            const [, genuine, again] = await run(posted('SHIPPING'), [
                { isPosted: false },
                { erpStatus: 'CANCELLED' },
                { isPosted: true },
            ]);
            expect(genuine).toMatchObject({ erpIsPosted: null, erpStatusBeforeUnposted: null });
            expect(again).not.toHaveProperty('erpStatus');
        });

        it('a genuine cancel with is_posted=false is terminal and the flag is not false', async () => {
            const [cancel, later] = await run(posted('SHIPPING'), [
                { isPosted: false, erpStatus: 'CANCELLED' },
                { isPosted: true },
            ]);
            expect(cancel).toMatchObject({ erpStatus: 'CANCELLED', erpIsPosted: null });
            expect(later).not.toHaveProperty('erpStatus');
        });

        it('a repeated not-posted event changes neither the status nor the saved status', async () => {
            const [, repeat] = await run(posted('SHIPPING'), [
                { isPosted: false },
                { isPosted: false },
            ]);
            expect(repeat).not.toHaveProperty('erpStatus');
            expect(repeat).not.toHaveProperty('erpStatusBeforeUnposted');
        });

        it('a repeated posted event after restore changes nothing', async () => {
            const [, , repeat] = await run(posted('SHIPPING'), [
                { isPosted: false },
                { isPosted: true },
                { isPosted: true },
            ]);
            expect(repeat).not.toHaveProperty('erpStatus');
            expect(repeat).toMatchObject({ erpIsPosted: true });
        });

        it('an event without is_posted leaves the fact and the status rules alone', async () => {
            const [fields] = await run(
                { erpStatus: 'CANCELLED', erpIsPosted: false, erpStatusBeforeUnposted: 'SHIPPING' },
                [{}],
            );
            expect(fields).not.toHaveProperty('erpIsPosted');
            expect(fields).not.toHaveProperty('erpStatus');
        });
    });
});
