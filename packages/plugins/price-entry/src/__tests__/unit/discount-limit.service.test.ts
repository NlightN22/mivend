import { describe, it, expect, vi } from 'vitest';
import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { DiscountLimitService } from '../../discount-limit.service';

const ctx = {} as RequestContext;

describe('DiscountLimitService', () => {
    it('refuses a limit outside 0..100 before touching the database', async () => {
        const connection = { getRepository: vi.fn(), withTransaction: vi.fn() };
        const service = new DiscountLimitService(connection as never, {} as never);
        for (const bad of [-1, 100.5, Number.NaN]) {
            await expect(service.setLimit(ctx, '7', 'all', '', bad)).rejects.toBeInstanceOf(
                UserInputError,
            );
        }
        expect(connection.withTransaction).not.toHaveBeenCalled();
    });

    it('has a 0% ceiling when the employee has no row, without loading product attributes', async () => {
        const find = vi.fn(async () => []);
        const connection = { getRepository: () => ({ find }), query: vi.fn() };
        const ceilings = await new DiscountLimitService(
            connection as never,
            {} as never,
        ).ceilingsForProducts(ctx, '7', ['p1']);
        expect(ceilings.get('p1')).toBe(0);
        expect(connection.query).not.toHaveBeenCalled();
    });

    it('refuses an unknown scope kind and a scope/reference mismatch', async () => {
        const connection = { getRepository: vi.fn(), withTransaction: vi.fn() };
        const service = new DiscountLimitService(connection as never, {} as never);
        await expect(service.setLimit(ctx, '7', 'colour', 'x', 5)).rejects.toBeInstanceOf(
            UserInputError,
        );
        await expect(service.setLimit(ctx, '7', 'all', 'x', 5)).rejects.toBeInstanceOf(
            UserInputError,
        );
        await expect(service.setLimit(ctx, '7', 'category', '', 5)).rejects.toBeInstanceOf(
            UserInputError,
        );
    });
});
