import { expect } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import type { ActorKey, CounterpartyKey } from '../seed/fixture-plan';

export const ONE = `query($id: ID!) { tradingPoint(id: $id) { id contacts { id name } } }`;
export const ROW = `query($id: ID!) { tradingPoint(id: $id) { name deliveryComment isActive customerStatus
    servicingBranchId contacts { name phone email isPrimary } } }`;
export const NESTED = `query($id: ID!) { counterparty(id: $id) { id tradingPoints { id contacts { id } } } }`;
export const SEARCH = `query($s: String!) { counterparties(options: { take: 100, search: $s }) {
    items { id tradingPoints { id } } } }`;
export const DETAILS = `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`;
export const ACTIVE = `mutation($id: ID!, $a: Boolean!) { setTradingPointActive(id: $id, isActive: $a) { id } }`;
export const COMMENT = `mutation($id: ID!) { updateTradingPointComment(tradingPointId: $id, comment: "access probe") { id } }`;
export const MOVE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;

export const SHOP_NESTED = `query { activeCustomer { counterparty { tradingPoints { id contacts { id } } } } }`;
export const SHOP_WRITES = [
    `mutation($id: ID!) { customerEditTradingPoint(id: $id, name: "access probe", address: "access probe", contactName: "access probe") { id } }`,
    `mutation($id: ID!) { customerDeleteTradingPoint(id: $id) }`,
    `mutation($id: ID!) { customerRestoreTradingPoint(id: $id) { id } }`,
    `mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`,
    `mutation($id: ID!) { updateTradingPointComment(tradingPointId: $id, comment: "access probe") { id } }`,
];

export type Point = { id: string; contacts: { id: string; name: string }[] } | null;

export const pointOf = (key: CounterpartyKey): string => seed().points[key];

export async function read(token: string, id: string): Promise<Point> {
    const result = await admin<{ tradingPoint: Point }>(token, ONE, { id });
    expect(result.errors, `tradingPoint(${id}) must not error`).toEqual([]);
    return result.data!.tradingPoint;
}

export async function readAs(key: ActorKey | 'superadmin', id: string): Promise<Point> {
    return read(await staffToken(key), id);
}

// The point as stored, read by the superadmin: what a refused write must leave unchanged.
export interface PointRow {
    servicingBranchId: string | null;
    [field: string]: unknown;
}

export async function pointRow(id: string): Promise<PointRow> {
    const result = await admin<{ tradingPoint: PointRow }>(await staffToken('superadmin'), ROW, {
        id,
    });
    expect(result.errors).toEqual([]);
    return result.data!.tradingPoint;
}
