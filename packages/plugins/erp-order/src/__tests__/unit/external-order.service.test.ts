import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { ExternalOrderService } from '../../external-order.service';
import type { ExternalOrderInput } from '../../external-order.types';

const ctx = {} as RequestContext;

function makeService(update: ReturnType<typeof vi.fn>): ExternalOrderService {
    const dictionary = {
        codeWith: () => 'NEW',
        vendureState: () => 'Shipped',
        has: () => false,
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
        .mockResolvedValue({ id: '1', isExternal: true, erpStatus: null });
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
});
