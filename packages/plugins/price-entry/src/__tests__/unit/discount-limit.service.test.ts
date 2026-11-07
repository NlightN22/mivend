import { describe, it, expect, vi } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { DiscountLimitService } from '../../discount-limit.service';

const ctx = {} as RequestContext;

describe('DiscountLimitService', () => {
    it('refuses a limit outside 0..100 before touching the database', async () => {
        const connection = { getRepository: vi.fn(), withTransaction: vi.fn() };
        const service = new DiscountLimitService(connection as never);
        for (const bad of [-1, 100.5, Number.NaN]) {
            await expect(service.setLimit(ctx, 'manager', '', bad)).rejects.toBeInstanceOf(
                UserInputError,
            );
        }
        expect(connection.withTransaction).not.toHaveBeenCalled();
    });

    it('has no limit for anyone when no role has a row, without loading product attributes', async () => {
        const find = vi.fn(async () => []);
        const connection = { getRepository: () => ({ find }), query: vi.fn() };
        const ceilings = await new DiscountLimitService(connection as never).ceilingsForProducts(
            ctx,
            ['manager'],
            ['p1'],
        );
        expect(ceilings.get('p1')).toBeNull();
        expect(connection.query).not.toHaveBeenCalled();
    });
});
