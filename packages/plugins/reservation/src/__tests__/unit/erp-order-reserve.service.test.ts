import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ErpOrderReserveService } from '../../erp-order-reserve.service';

describe('ErpOrderReserveService.record', () => {
    function create() {
        const query = vi.fn(async () => undefined);
        const connection = {
            getRepository: () => ({ query }),
            withTransaction: vi.fn(async (ctx: unknown, fn: (c: unknown) => Promise<void>) =>
                fn(ctx),
            ),
        };
        return { service: new ErpOrderReserveService(connection as never), query, connection };
    }
    const ctx = {} as RequestContext;

    it('upserts the reported variants and deletes the others in one transaction', async () => {
        const { service, query, connection } = create();

        await service.record(ctx, 7, [{ productVariantId: '10', reservedQuantity: 2 }], null);

        expect(connection.withTransaction).toHaveBeenCalledTimes(1);
        const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
        expect(calls[0][0]).toContain('INSERT INTO erp_order_reserve');
        expect(calls[1][0]).toContain('DELETE FROM erp_order_reserve');
        expect(calls[1][1]).toEqual(['7', ['10']]);
    });

    it('removes every row of the order when the ERP reports no lines', async () => {
        const { service, query } = create();

        await service.record(ctx, 7, [], null);

        const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toEqual(['7', []]);
    });
});
