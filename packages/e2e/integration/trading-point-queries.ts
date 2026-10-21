import { adminCall } from './price-type-access';
import { actorToken, type ActorKey } from './branch-actors';

export const ONE = `query($id: ID!) { tradingPoint(id: $id) { id contacts { id name } } }`;
export const NESTED = `query($id: ID!) { counterparty(id: $id) { id tradingPoints { id contacts { id } } } }`;
export const SEARCH = `query($s: String!) { counterparties(options: { take: 100, search: $s }) {
    items { id tradingPoints { id } } } }`;
export const SHORT_NAME = `query($id: ID!) { counterparty(id: $id) { shortName } }`;
export const DETAILS = `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`;
export const ACTIVE = `mutation($id: ID!, $a: Boolean!) { setTradingPointActive(id: $id, isActive: $a) { id } }`;
export const COMMENT = `mutation($id: ID!) { updateTradingPointComment(tradingPointId: $id, comment: "e2e-int probe") { id } }`;
export const MOVE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;
export const DENIED = /not currently authorized/i;

export type Point = { id: string; contacts: { id: string; name: string }[] } | null;

export async function read(token: string, id: string): Promise<Point> {
    const result = await adminCall(token, ONE, { id });
    return (result.data as { tradingPoint: Point } | null)?.tradingPoint ?? null;
}

export async function readAs(key: ActorKey, id: string): Promise<Point> {
    return read(await actorToken(key), id);
}

export const SHOP_NESTED = `query { activeCustomer { counterparty { tradingPoints { id contacts { id } } } } }`;
export const SHOP_WRITES = [
    `mutation($id: ID!) { customerEditTradingPoint(id: $id, name: "e2e-int probe", address: "e2e-int probe", contactName: "e2e-int probe") { id } }`,
    `mutation($id: ID!) { customerDeleteTradingPoint(id: $id) }`,
    `mutation($id: ID!) { customerRestoreTradingPoint(id: $id) { id } }`,
    `mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`,
    `mutation($id: ID!) { updateTradingPointComment(tradingPointId: $id, comment: "e2e-int probe") { id } }`,
];
