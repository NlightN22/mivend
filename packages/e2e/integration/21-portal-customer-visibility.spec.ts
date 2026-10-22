import { expect, test } from '@playwright/test';
import { shopLoginCookie } from '../helpers/api';
import { adminCall, superadminToken } from './price-type-access';
import { customerCounterparty, shop } from './document-scope';
import { ACTORS, actorCredentials, actorState, actorToken, expectedIds } from './branch-actors';
import { shopCustomers } from './trading-point-scope';
import {
    BATCH,
    CUSTOMER,
    DEACTIVATE,
    DENIED,
    ONE,
    PORTAL,
    activeCustomer,
    counterpartyField,
    customerIdsOf,
    customerRows,
    hasPermission,
    teamTargets,
    type Target,
} from './team-scope';

type Linked = { id: string; linkedCustomerId: string | null };

let superadmin: string;
let targets: Target[];

test.beforeAll(async () => {
    superadmin = await superadminToken();
    targets = teamTargets();
    expect(targets.map(t => t.label)).toEqual([
        'branch-a client',
        'branch-b client',
        'branch-less client',
    ]);
    for (const t of targets) expect(t.customerIds.length, t.label).toBeGreaterThan(0);
});

for (const actor of ACTORS) {
    test.describe(`21: portal customers for ${actor.key} (${actor.role}, ${actor.scope} scope)`, () => {
        let token: string;
        let visible: Set<string>;
        let canManage: boolean;

        test.beforeAll(async () => {
            if (!actorCredentials(actor.key)) return;
            const state = actorState(actor);
            visible = expectedIds(actor, state);
            canManage = hasPermission(state.adminId, 'ManageCounterpartyPortalAccess');
            token = await actorToken(actor.key);
        });
        test.beforeEach(() => {
            test.skip(!actorCredentials(actor.key), `the ${actor.key} login is not set`);
        });

        test('a portal customer is read exactly when its client is visible', async () => {
            if (actor.scope !== 'all')
                expect(
                    targets.some(t => !visible.has(t.counterpartyId)),
                    'a hidden client',
                ).toBe(true);
            const listed = await customerIdsOf(token);
            for (const target of targets) {
                const shown = visible.has(target.counterpartyId);
                const filtered = await customerIdsOf(token, {
                    counterpartyId: { eq: target.counterpartyId },
                });
                const parent = await counterpartyField<Linked>(token, ONE, target.counterpartyId);
                for (const id of target.customerIds) {
                    const one = await adminCall(token, CUSTOMER, { id });
                    expect(one.errors).toEqual([]);
                    const got = (one.data as { customer: { id: string } | null }).customer;
                    expect(got?.id ?? null, `${target.label}: customer by id`).toBe(
                        shown ? id : null,
                    );
                    expect(listed.ids.includes(id), `${target.label}: in the list`).toBe(shown);
                    const asSuperadmin = await adminCall(superadmin, CUSTOMER, { id });
                    expect(
                        (asSuperadmin.data as { customer: { id: string } | null }).customer?.id,
                    ).toBe(id);
                }
                expect(filtered.total, `${target.label}: filtered by client`).toBe(
                    shown ? target.customerIds.length : 0,
                );
                const linked = await counterpartyField<Linked>(
                    superadmin,
                    ONE,
                    target.counterpartyId,
                );
                expect(linked.value?.linkedCustomerId, `${target.label}: linked`).toBeTruthy();
                expect(parent.value?.linkedCustomerId ?? null, target.label).toBe(
                    shown ? linked.value!.linkedCustomerId : null,
                );
            }
            const expected = customerRows()
                .filter(r => actor.scope === 'all' || (r.cp !== null && visible.has(r.cp)))
                .map(r => r.id);
            expect(listed.ids.sort(), 'the whole list').toEqual(expected.sort());
            expect(listed.total).toBe(expected.length);
        });

        test('portal users of a client follow the client and the portal-access permission', async () => {
            for (const target of targets) {
                const shown = visible.has(target.counterpartyId);
                const got = await counterpartyField<{ portalUsers: { id: string }[] }>(
                    token,
                    PORTAL,
                    target.counterpartyId,
                );
                if (!shown) {
                    expect(got.value, `${target.label} is hidden`).toBeNull();
                    const proof = await counterpartyField<{ portalUsers: { id: string }[] }>(
                        superadmin,
                        PORTAL,
                        target.counterpartyId,
                    );
                    expect(proof.value?.portalUsers.length).toBeGreaterThan(0);
                } else if (canManage) {
                    expect(got.value!.portalUsers.map(u => u.id)).toEqual(
                        expect.arrayContaining(target.customerIds),
                    );
                } else expect(got.errors.join(' ')).toMatch(/not currently authorized/i);
            }
        });

        test('portal access of a hidden client cannot be switched off', async () => {
            const hidden = targets.filter(t => !visible.has(t.counterpartyId));
            test.skip(hidden.length === 0, 'no hidden client for this actor');
            for (const target of hidden) {
                const customerId = target.customerIds[0];
                const single = await adminCall(token, DEACTIVATE, { id: customerId });
                expect(single.errors.join(' '), target.label).toMatch(DENIED);
                const batch = await adminCall(token, BATCH, { c: target.counterpartyId });
                const rows = (
                    batch.data as {
                        applyCounterpartyPortalAccessChanges: { success: boolean }[];
                    } | null
                )?.applyCounterpartyPortalAccessChanges;
                if (rows) expect(rows.every(r => !r.success)).toBe(true);
                else expect(batch.errors.join(' ')).toMatch(DENIED);
                expect(activeCustomer(customerId), `${target.label}: still active`).toBe(true);
            }
        });
    });
}

const customers = shopCustomers();
for (const customer of customers) {
    test(`21: ${customer.label} reads only its own customer and client in the storefront`, async () => {
        test.skip(!customers.every(c => c.login), 'a customer login is not set');
        const cookie = await shopLoginCookie(customer.login!.email, customer.login!.password);
        const own = customerCounterparty(customer.login!.email);
        const other = customers.find(c => c !== customer)!;
        expect(customerCounterparty(other.login!.email)).not.toBe(own);
        const me = await shop<{
            activeCustomer: { emailAddress: string; counterparty: { id: string } | null };
        }>(`query { activeCustomer { emailAddress counterparty { id } } }`, undefined, cookie);
        expect(me.errors).toEqual([]);
        expect(me.data!.activeCustomer.emailAddress).toBe(customer.login!.email);
        expect(me.data!.activeCustomer.counterparty?.id).toBe(own);
        const guest = await shop<{ activeCustomer: unknown }>(`query { activeCustomer { id } }`);
        expect(guest.data?.activeCustomer ?? null).toBeNull();
    });
}
