import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { SalesCurrencyResolverService } from '../../sales-analytics/sales-currency-resolver.service';

const ctx = {} as RequestContext;
const find = vi.fn();
const service = new SalesCurrencyResolverService({
    getRepository: () => ({ find }),
} as never);

describe('SalesCurrencyResolverService', () => {
    it('resolves an id and a numeric code through the catalog, falls back to the static map', async () => {
        find.mockResolvedValue([
            { entityId: 'cur-1', code: 'USD', numericCode: '840', isActive: true },
        ]);
        const toCode = await service.resolver(ctx, ['cur-1', '840', '643', 'cur-9', '']);
        expect(toCode('cur-1')).toBe('USD');
        expect(toCode('840')).toBe('USD');
        expect(toCode('643')).toBe('RUB');
        expect(toCode('cur-9')).toBe('cur-9');
        expect(toCode('')).toBe('');
    });

    it('does not map a numeric code of an inactive record', async () => {
        find.mockResolvedValue([
            { entityId: 'cur-2', code: 'XXX', numericCode: '999', isActive: false },
        ]);
        const toCode = await service.resolver(ctx, ['999']);
        expect(toCode('999')).toBe('999');
        expect(toCode('cur-2')).toBe('XXX');
    });

    it('skips the lookup when there is nothing to resolve', async () => {
        find.mockClear();
        const toCode = await service.resolver(ctx, ['', ' ']);
        expect(find).not.toHaveBeenCalled();
        expect(toCode('')).toBe('');
    });
});
