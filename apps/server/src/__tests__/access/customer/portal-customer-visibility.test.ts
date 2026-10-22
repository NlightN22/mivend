import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, shop, staffToken } from '../harness/actors';
import {
    CUSTOMERS,
    PORTAL_ACCESS_MANAGERS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    customerEmail,
    type ActorKey,
    type CounterpartyKey,
} from '../seed/fixture-plan';
import {
    BATCH,
    DEACTIVATE,
    HIDDEN_WRITE,
    ONE,
    PORTAL,
    counterpartyField,
    customerById,
    customerList,
    linkedCustomers,
} from './portal-customer-queries';

// The branch-a, branch-b and branch-less clients, each with a portal customer.
const TARGETS: CounterpartyKey[] = ['a-own', 'b-own', 'none'];

let linked: Record<string, string[]>;

beforeAll(async () => {
    linked = {};
    for (const target of TARGETS) {
        linked[target] = await linkedCustomers(target);
        expect(linked[target].length, `portal customers of ${target}`).toBeGreaterThan(0);
    }
});

describe.each(STAFF.map(s => s.key))('portal customers for %s', (key: ActorKey) => {
    const visible = new Set(VISIBLE_COUNTERPARTIES[key]);
    const canManage = PORTAL_ACCESS_MANAGERS.includes(key);
    let token: string;
    let superadmin: string;

    beforeAll(async () => {
        token = await staffToken(key);
        superadmin = await staffToken('superadmin');
    });

    it('a portal customer is read exactly when its client is visible', async () => {
        if (key !== 'director')
            expect(
                TARGETS.some(t => !visible.has(t)),
                'a hidden client',
            ).toBe(true);
        const listed = await customerList(token);
        const ids = listed.items.map(i => i.id);
        for (const target of TARGETS) {
            const shown = visible.has(target);
            for (const id of linked[target]) {
                expect(await customerById(token, id), `${target}: customer by id`).toBe(
                    shown ? id : null,
                );
                expect(ids.includes(id), `${target}: in the list`).toBe(shown);
                expect(await customerById(superadmin, id)).toBe(id);
            }
            const filtered = await customerList(token, {
                counterpartyId: { eq: seed().counterparties[target] },
            });
            expect(filtered.total, `${target}: filtered by client`).toBe(
                shown ? linked[target].length : 0,
            );
            type Linked = { linkedCustomerId: string | null };
            const proof = await counterpartyField<Linked>(superadmin, ONE, target);
            expect(proof.value?.linkedCustomerId, `${target}: linked`).toBeTruthy();
            const parent = await counterpartyField<Linked>(token, ONE, target);
            expect(parent.value?.linkedCustomerId ?? null, target).toBe(
                shown ? proof.value!.linkedCustomerId : null,
            );
        }
        const everyone = await customerList(superadmin);
        const expected = everyone.items
            .filter(
                i =>
                    key === 'director' ||
                    VISIBLE_COUNTERPARTIES[key].some(
                        cp => seed().counterparties[cp] === i.counterparty?.id,
                    ),
            )
            .map(i => i.id);
        expect([...ids].sort(), 'the whole list').toEqual(expected.sort());
        expect(listed.total).toBe(expected.length);
    });

    it('portal users of a client follow the client and the portal-access permission', async () => {
        for (const target of TARGETS) {
            const got = await counterpartyField<{ portalUsers: { id: string }[] }>(
                token,
                PORTAL,
                target,
            );
            if (!visible.has(target)) {
                expect(got.value, `${target} is hidden`).toBeNull();
                const proof = await counterpartyField<{ portalUsers: { id: string }[] }>(
                    superadmin,
                    PORTAL,
                    target,
                );
                expect(proof.value?.portalUsers.length).toBeGreaterThan(0);
            } else if (canManage)
                expect(got.value!.portalUsers.map(u => u.id)).toEqual(
                    expect.arrayContaining(linked[target]),
                );
            else expect(got.errors.join(' '), target).toMatch(DENIED);
        }
    });

    it('portal access of a hidden client cannot be switched off', async () => {
        for (const target of TARGETS.filter(t => !visible.has(t))) {
            const customerId = linked[target][0];
            const single = await admin(token, DEACTIVATE, { id: customerId });
            expect(single.errors.join(' '), target).toMatch(HIDDEN_WRITE);
            const batch = await admin<{
                applyCounterpartyPortalAccessChanges: { success: boolean }[];
            }>(token, BATCH, { c: seed().counterparties[target] });
            const rows = batch.data?.applyCounterpartyPortalAccessChanges;
            if (rows) expect(rows.every(r => !r.success)).toBe(true);
            else expect(batch.errors.join(' ')).toMatch(HIDDEN_WRITE);
            expect(await customerById(superadmin, customerId), `${target}: still active`).toBe(
                customerId,
            );
        }
    });
});

describe.each(CUSTOMERS.map(c => c.key))('%s in the storefront', key => {
    it('reads only its own customer and client', async () => {
        const own = CUSTOMERS.find(c => c.key === key)!.counterparty;
        const me = await shop<{
            activeCustomer: { emailAddress: string; counterparty: { id: string } | null };
        }>(
            await customerToken(key),
            `query { activeCustomer { emailAddress counterparty { id } } }`,
        );
        expect(me.errors).toEqual([]);
        expect(me.data!.activeCustomer.emailAddress).toBe(customerEmail(key));
        expect(me.data!.activeCustomer.counterparty?.id).toBe(seed().counterparties[own]);
    });
});

it('a guest has no active customer', async () => {
    const guest = await shop<{ activeCustomer: unknown }>('', `query { activeCustomer { id } }`);
    expect(guest.data?.activeCustomer ?? null).toBeNull();
});
