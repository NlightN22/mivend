import { describe, it, expect, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationExtensionLimitService } from '../../reservation-extension-limit.service';

const ctx = {} as RequestContext;

function setup(rows: Array<{ roleCode: string; maxExtraDays: number }>) {
    const find = vi.fn(async () => rows);
    const connection = { getRepository: () => ({ find }) };
    return {
        service: new ReservationExtensionLimitService(
            connection as unknown as TransactionalConnection,
        ),
        find,
    };
}

describe('ReservationExtensionLimitService.getMaxLimit', () => {
    it('returns the most permissive limit among the roles', async () => {
        const { service } = setup([
            { roleCode: 'a', maxExtraDays: 2 },
            { roleCode: 'b', maxExtraDays: 9 },
            { roleCode: 'c', maxExtraDays: 5 },
        ]);
        expect(await service.getMaxLimit(ctx, ['a', 'b', 'c'])).toMatchObject({ maxExtraDays: 9 });
    });

    it('uses a role that has a row even when another role has none', async () => {
        const { service } = setup([{ roleCode: 'b', maxExtraDays: 4 }]);
        expect(await service.getMaxLimit(ctx, ['a', 'b'])).toMatchObject({ maxExtraDays: 4 });
    });

    it('is null when no role has a row, and skips the query for no roles', async () => {
        const none = setup([]);
        expect(await none.service.getMaxLimit(ctx, ['a'])).toBeNull();
        expect(await none.service.getMaxLimit(ctx, [])).toBeNull();
        expect(none.find).toHaveBeenCalledTimes(1);
    });
});
