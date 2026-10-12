import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DeferredCreditShopResolver } from '../../api/shop.resolver';

const getActiveOrder = vi.fn();
const preview = vi.fn();
const resolver = new DeferredCreditShopResolver({ getActiveOrder } as never, { preview } as never);

describe('deferredCreditPreview', () => {
    it('returns the placement preview of the active order', async () => {
        const result = { exceeded: true, availableCredit: 10, orderAmount: 20 };
        getActiveOrder.mockResolvedValue({ id: 1 });
        preview.mockResolvedValue(result);
        expect(await resolver.deferredCreditPreview({ activeUserId: 5 } as RequestContext)).toBe(
            result,
        );
    });

    it('is empty for anonymous callers and without an active order', async () => {
        const anonymous = await resolver.deferredCreditPreview({} as RequestContext);
        expect(anonymous).toMatchObject({ exceeded: false, availableForms: [] });
        getActiveOrder.mockResolvedValue(undefined);
        expect(
            await resolver.deferredCreditPreview({ activeUserId: 5 } as RequestContext),
        ).toMatchObject({ exceeded: false, availableForms: [] });
    });
});
