import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { DeferredCreditShopResolver } from '../../api/shop.resolver';

const getActiveOrder = vi.fn();
const assess = vi.fn();
const resolver = new DeferredCreditShopResolver({ getActiveOrder } as never, { assess } as never);
const none = { exceeded: false, availableCredit: 0, orderAmount: 0 };

describe('deferredCreditPreview', () => {
    it('returns the assessment of the active order', async () => {
        const result = { exceeded: true, availableCredit: 10, orderAmount: 20 };
        getActiveOrder.mockResolvedValue({ id: 1 });
        assess.mockResolvedValue(result);
        expect(await resolver.deferredCreditPreview({ activeUserId: 5 } as RequestContext)).toEqual(
            result,
        );
    });

    it('is not exceeded for anonymous callers, without an order, or without a counterparty', async () => {
        expect(await resolver.deferredCreditPreview({} as RequestContext)).toEqual(none);
        getActiveOrder.mockResolvedValue(undefined);
        expect(await resolver.deferredCreditPreview({ activeUserId: 5 } as RequestContext)).toEqual(
            none,
        );
        getActiveOrder.mockResolvedValue({ id: 1 });
        assess.mockResolvedValue(null);
        expect(await resolver.deferredCreditPreview({ activeUserId: 5 } as RequestContext)).toEqual(
            none,
        );
    });
});
