import { describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { LineDiscountService } from '../../line-discount.service';
import type { LineDiscount } from '../../line-discount.service';

const ctx = {} as RequestContext;
const d = (over: Partial<LineDiscount>): LineDiscount => ({
    lineId: '1',
    productErpId: 'p',
    reference: 100,
    effective: 100,
    percent: 0,
    manual: false,
    ...over,
});

function service(automatic: number | null) {
    const svc = new LineDiscountService(
        {} as never,
        { findOne: async () => ({ lines: [{ id: 1 }, { id: 2 }, { id: 3 }] }) } as never,
        {} as never,
    );
    svc.automaticPrice = async () => automatic;
    return svc;
}

describe('LineDiscountService.limitApplies', () => {
    it('does not judge a purely automatic discount, but does a line without any discount', async () => {
        const applies = await service(null).limitApplies(ctx, 'o', [
            d({ lineId: '1', effective: 90, percent: 10 }),
            d({ lineId: '2' }),
        ]);
        expect([...applies]).toEqual(['2']);
    });

    it('judges a manual price only when it is deeper than the automatic price', async () => {
        const manual = (lineId: string, effective: number) =>
            d({ lineId, effective, percent: 100 - effective, manual: true });
        const applies = await service(90).limitApplies(ctx, 'o', [
            manual('1', 85),
            manual('2', 90),
            manual('3', 95),
        ]);
        expect([...applies]).toEqual(['1']);
    });
});
