import { expect, test } from '@playwright/test';
import { adminCall, superadminToken } from './price-type-access';
import { actorCredentials, actorState, actorToken, ACTORS, type ActorKey } from './branch-actors';
import { orderOnPlainPoint, pointOverride } from './order-scope';

const ONE = `query($id: ID!) { order(id: $id) { id } }`;
const OVERRIDE = `mutation($id: ID!, $b: String) { updateTradingPointDetails(id: $id, input: { servicingBranchId: $b }) { id } }`;
const HEADS: ActorKey[] = ['head-a', 'head-b'];

async function sees(key: ActorKey, orderId: string): Promise<boolean> {
    const result = await adminCall(await actorToken(key), ONE, { id: orderId });
    return ((result.data as { order: unknown } | null)?.order ?? null) !== null;
}

test('14: a point serviced by another branch moves its order there and back', async () => {
    test.skip(
        HEADS.some(k => !actorCredentials(k)),
        'a head login is not set in the staging-integration env file',
    );
    const order = orderOnPlainPoint();
    const branchOf = (key: ActorKey): string =>
        actorState(ACTORS.find(a => a.key === key)!).branchId as string;
    const home = HEADS.find(k => branchOf(k) === order.branchId);
    const other = HEADS.find(k => branchOf(k) !== order.branchId);
    test.skip(!home || !other, 'the order counterparty belongs to neither head branch');
    const superadmin = await superadminToken();

    expect(await sees(home!, order.id), `${home} sees order ${order.code} before`).toBe(true);
    expect(await sees(other!, order.id), `${other} does not see it before`).toBe(false);
    try {
        const set = await adminCall(superadmin, OVERRIDE, {
            id: order.pointId,
            b: branchOf(other!),
        });
        expect(set.errors).toEqual([]);
        expect(pointOverride(order.pointId)).toBe(branchOf(other!));
        expect(await sees(other!, order.id), `${other} sees it through the point`).toBe(true);
        expect(await sees(home!, order.id), `${home} loses it`).toBe(false);
    } finally {
        const reset = await adminCall(superadmin, OVERRIDE, { id: order.pointId, b: null });
        expect(reset.errors).toEqual([]);
        expect(pointOverride(order.pointId), 'the override is removed').toBeNull();
    }
    expect(await sees(home!, order.id), `${home} sees it again`).toBe(true);
});
