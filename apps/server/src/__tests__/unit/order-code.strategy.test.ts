import type { Injector, RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { NumberingOrderCodeStrategy } from '../../order-code.strategy';

const mockCtx = {} as unknown as RequestContext;

describe('NumberingOrderCodeStrategy', () => {
    it('delegates generation to NumberingService.next(ctx, "order")', async () => {
        const next = vi.fn().mockResolvedValue('1000000001');
        const injector = { get: vi.fn().mockReturnValue({ next }) } as unknown as Injector;

        const strategy = new NumberingOrderCodeStrategy();
        strategy.init(injector);
        const code = await strategy.generate(mockCtx);

        expect(code).toBe('1000000001');
        expect(next).toHaveBeenCalledWith(mockCtx, 'order');
    });
});
