import { expect, it } from 'vitest';

import { seed, staffToken } from '../harness/actors';
import { orderOf, pointState, seesOrder, setPointBranch } from './order-queries';

it('a point serviced by another branch moves its order there and back', async () => {
    const order = orderOf('b-own');
    const [home, other] = [await staffToken('head-b'), await staffToken('head-a')];
    // A point is created serviced by its counterparty's branch.
    const original = (await pointState(order.pointId)).servicingBranchId;
    expect(original).toBe(seed().branches.b);
    expect(await seesOrder(home, 'b-own'), 'head-b sees it before').toBe(true);
    expect(await seesOrder(other, 'b-own'), 'head-a does not see it before').toBe(false);
    try {
        await setPointBranch(order.pointId, seed().branches.a);
        expect((await pointState(order.pointId)).servicingBranchId).toBe(seed().branches.a);
        expect(await seesOrder(other, 'b-own'), 'head-a sees it through the point').toBe(true);
        expect(await seesOrder(home, 'b-own'), 'head-b loses it').toBe(false);
    } finally {
        await setPointBranch(order.pointId, original);
    }
    expect((await pointState(order.pointId)).servicingBranchId, 'the point is back').toBe(original);
    expect(await seesOrder(home, 'b-own'), 'head-b sees it again').toBe(true);
    expect(await seesOrder(other, 'b-own')).toBe(false);
});
