import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderLinesEditAdapter } from '../../order-lines-edit.adapter';

function build(existing: number) {
    const issueForOrder = vi.fn(async () => ({ created: [{ id: 9 }], current: [] }));
    const publish = vi.fn();
    const adapter = new OrderLinesEditAdapter(
        { getRepository: () => ({ count: async () => existing }) } as never,
        { issueForOrder } as never,
        { register: vi.fn() } as never,
        { publish } as never,
    );
    return { adapter, issueForOrder, publish };
}

describe('OrderLinesEditAdapter', () => {
    it('reissues proforma invoices when the order has some', async () => {
        const { adapter, issueForOrder, publish } = build(2);
        await adapter.afterLinesEdited({} as RequestContext, '5');
        expect(issueForOrder).toHaveBeenCalledWith(expect.anything(), '5');
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('issues nothing for an order without proforma invoices', async () => {
        const { adapter, issueForOrder, publish } = build(0);
        await adapter.afterLinesEdited({} as RequestContext, '5');
        expect(issueForOrder).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });
});
