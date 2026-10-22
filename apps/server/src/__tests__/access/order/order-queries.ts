import { expect } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import { ORDERS, type OrderKey } from '../seed/fixture-plan';

export const ALL_ORDERS: OrderKey[] = ORDERS.map(o => o.key);
export const orderOf = (key: OrderKey): { id: string; code: string; pointId: string } =>
    seed().ordering.orders[key];
// The same answer as for an id that does not exist, so a hidden order cannot be told from a missing one.
export const NOT_FOUND = /No Order with the id "\d+" could be found|not found/i;
export const OVERRIDE = `mutation($id: ID!, $b: String) { updateTradingPointDetails(id: $id, input: { servicingBranchId: $b }) { id } }`;

const ONE = `query($id: ID!) { order(id: $id) { id } }`;
const NOTES = `query($id: ID!) { order(id: $id) { history(options: { take: 500, filter: { type: { eq: "ORDER_NOTE" } } }) { totalItems } } }`;

export async function seesOrder(token: string, key: OrderKey): Promise<boolean> {
    const result = await admin<{ order: { id: string } | null }>(token, ONE, {
        id: orderOf(key).id,
    });
    for (const e of result.errors) expect(e).toMatch(NOT_FOUND);
    return (result.data?.order ?? null) !== null;
}

export async function noteCount(key: OrderKey): Promise<number> {
    const result = await admin<{ order: { history: { totalItems: number } } }>(
        await staffToken('superadmin'),
        NOTES,
        { id: orderOf(key).id },
    );
    expect(result.errors).toEqual([]);
    return result.data!.order.history.totalItems;
}

export async function setPointBranch(pointId: string, branchId: string | null): Promise<void> {
    const result = await admin(await staffToken('superadmin'), OVERRIDE, {
        id: pointId,
        b: branchId,
    });
    expect(result.errors).toEqual([]);
}

export interface PointState {
    name: string;
    deliveryComment: string | null;
    isActive: boolean;
    customerStatus: string;
    servicingBranchId: string | null;
    contacts: { name: string; phone: string | null; email: string | null; isPrimary: boolean }[];
}

const POINT = `query($id: ID!) { tradingPoint(id: $id) { name deliveryComment isActive customerStatus
    servicingBranchId contacts { name phone email isPrimary } } }`;

export async function pointState(pointId: string): Promise<PointState> {
    const result = await admin<{ tradingPoint: PointState }>(
        await staffToken('superadmin'),
        POINT,
        {
            id: pointId,
        },
    );
    expect(result.errors).toEqual([]);
    return result.data!.tradingPoint;
}
