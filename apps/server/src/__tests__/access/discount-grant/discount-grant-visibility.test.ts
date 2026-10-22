import { beforeAll, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';
import { GRANTS, PRICE_TYPES, grantJustification, type GrantKey } from '../seed/fixture-plan';

const REQUEST = `mutation($i: DiscountGrantInput!) { requestDiscountGrant(input: $i) { id status } }`;
const REGISTRY = `{ discountRegistryPage(options: { take: 100 }) { totalItems items { approvalRequestId priceTypeCode justification } } }`;
const INBOX = `{ myApprovalsInbox(allInvolvedOptions: { take: 100, requestType: "discountGrantApproval" },
    awaitingOptions: { take: 100, requestType: "discountGrantApproval" }) {
    allInvolved { items { id payload } } awaitingMyDecision { items { id payload } } } }`;
const BY_TYPE = `{ approvalRequestsByType(requestType: "discountGrantApproval", options: { take: 100 }) { items { id payload } } }`;
const ONE = `query($id: ID!) { approvalRequest(id: $id) { id payload } }`;
const KEYS = Object.keys(GRANTS) as GrantKey[];
const HIDDEN_KEYS: GrantKey[] = ['hidden', 'confidential'];

type Registry = {
    discountRegistryPage: {
        totalItems: number;
        items: { approvalRequestId: string; priceTypeCode: string; justification: string }[];
    };
};

let manager: string;
let superadmin: string;
const requestIds = {} as Record<GrantKey, string>;

async function registry(token: string): Promise<Registry['discountRegistryPage']> {
    const result = await admin<Registry>(token, REGISTRY);
    expect(result.errors).toEqual([]);
    return result.data!.discountRegistryPage;
}

beforeAll(async () => {
    manager = await staffToken('manager-a');
    superadmin = await staffToken('superadmin');
    const all = await registry(superadmin);
    for (const key of KEYS) {
        const found = all.items.find(i => i.justification === grantJustification(key));
        expect(found, `the ${key} grant exists`).toBeTruthy();
        requestIds[key] = found!.approvalRequestId;
    }
});

it('the manager cannot request a grant for a hidden or confidential type, and nothing is created', async () => {
    const before = (await registry(superadmin)).totalItems;
    const day = 24 * 3600 * 1000;
    for (const code of [PRICE_TYPES.b, PRICE_TYPES.purchase]) {
        const result = await admin(manager, REQUEST, {
            i: {
                priceTypeCode: code,
                percent: 1,
                validFrom: new Date().toISOString(),
                validTo: new Date(Date.now() + 30 * day).toISOString(),
                justification: 'access-grant-denied',
            },
        });
        expect(result.errors.join(), `request for ${code}`).toMatch(DENIED);
        expect(result.data).toBeNull();
    }
    expect((await registry(superadmin)).totalItems, 'no request was created').toBe(before);
});

it('grants of hidden types exist for the superadmin but are invisible to the manager', async () => {
    const items = (await registry(manager)).items;
    const ids = items.map(i => i.approvalRequestId);
    expect(ids).toContain(requestIds.allowed);
    for (const key of HIDDEN_KEYS) expect(ids, key).not.toContain(requestIds[key]);
    for (const key of HIDDEN_KEYS)
        expect(items.map(i => i.priceTypeCode)).not.toContain(GRANTS[key].code);
});

it('the approvals inbox and request lookups hide the hidden grants from the manager', async () => {
    const inbox = await admin(manager, INBOX);
    expect(inbox.errors).toEqual([]);
    const text = JSON.stringify(inbox.data);
    expect(text).toContain(grantJustification('allowed'));
    for (const key of HIDDEN_KEYS) expect(text).not.toContain(grantJustification(key));

    const byType = await admin(manager, BY_TYPE);
    const listed = JSON.stringify(byType.data) + byType.errors.join();
    for (const key of HIDDEN_KEYS) expect(listed).not.toContain(grantJustification(key));

    for (const key of HIDDEN_KEYS) {
        const one = await admin(manager, ONE, { id: requestIds[key] });
        expect(JSON.stringify(one.data) + one.errors.join(), `${key} lookup`).not.toContain(
            grantJustification(key),
        );
        const proof = await admin(superadmin, ONE, { id: requestIds[key] });
        expect(JSON.stringify(proof.data), `${key} exists`).toContain(grantJustification(key));
    }
});
