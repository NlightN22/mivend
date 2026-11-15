import { inject, describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, staffToken } from '../harness/actors';
import { gqlOk, login } from '../harness/graphql';
import {
    CUSTOMERS,
    ERP_POA_DELETED_CONTRACT,
    ERP_POA_NUMBERS,
    ERP_POA_UNKNOWN_CONTRACT,
    POA_DELETED_READERS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    type ActorKey,
} from '../seed/fixture-plan';

const LIST = `query($l: PowerOfAttorneyListInput) { visiblePowersOfAttorney(list: $l) {
    totalItems items { number contractDeleted } } }`;
const COUNTS = `query($cp: ID) { relatedErpDocumentCounts(counterpartyId: $cp) { powersOfAttorney } }`;
type Page = {
    visiblePowersOfAttorney: {
        totalItems: number;
        items: { number: string; contractDeleted: boolean }[];
    };
};

const ours = [
    ...Object.values(ERP_POA_NUMBERS),
    ERP_POA_DELETED_CONTRACT,
    ERP_POA_UNKNOWN_CONTRACT,
];
const numbersOf = (r: Page): string[] =>
    r.visiblePowersOfAttorney.items.map(i => i.number).filter(n => ours.includes(n));

describe('staff ERP powers of attorney', () => {
    it('the director with scope all sees every row, the deleted contract marked', async () => {
        const res = await admin<Page>(await staffToken('director'), LIST, { l: { take: 200 } });
        expect(res.errors).toEqual([]);
        expect(numbersOf(res.data!).sort()).toEqual([...ours].sort());
        const deleted = res.data!.visiblePowersOfAttorney.items.filter(i => i.contractDeleted);
        expect(deleted.map(i => i.number)).toEqual([ERP_POA_DELETED_CONTRACT]);
    });

    describe.each(STAFF.map(s => [s.key, s.scope] as const))('staff %s', (key: ActorKey, scope) => {
        it('sees the rows of visible customer contracts; deleted-contract rows only with the permission', async () => {
            const token = await staffToken(key);
            const visible = new Set(VISIBLE_COUNTERPARTIES[key]);
            const reader = POA_DELETED_READERS.includes(key);
            const expected = [
                ...CUSTOMERS.filter(c => visible.has(c.counterparty)).map(
                    c => ERP_POA_NUMBERS[c.key],
                ),
                ...(reader && visible.has(CUSTOMERS[0].counterparty)
                    ? [ERP_POA_DELETED_CONTRACT]
                    : []),
                ...(scope === 'all' ? [ERP_POA_UNKNOWN_CONTRACT] : []),
            ].sort();
            const list = await admin<Page>(token, LIST, { l: { take: 200 } });
            expect(list.errors).toEqual([]);
            expect(numbersOf(list.data!).sort()).toEqual(expected);
            const counted = await admin<Page>(token, LIST, { l: { take: 0 } });
            expect(counted.data!.visiblePowersOfAttorney.totalItems).toBe(
                list.data!.visiblePowersOfAttorney.totalItems,
            );
            for (const c of CUSTOMERS) {
                const related = await admin<{
                    relatedErpDocumentCounts: { powersOfAttorney: number };
                }>(token, COUNTS, { cp: seed().counterparties[c.counterparty] });
                expect(related.errors, c.key).toEqual([]);
                const deletedHere =
                    reader && c.key === 'customer-a' && visible.has(c.counterparty) ? 1 : 0;
                expect(related.data!.relatedErpDocumentCounts.powersOfAttorney, c.key).toBe(
                    visible.has(c.counterparty) ? 1 + deletedHere : 0,
                );
            }
        });
    });

    it('refuses a caller without the counterparty right', async () => {
        const res = await admin(await customerToken('customer-a'), LIST, { l: {} });
        expect(JSON.stringify(res.errors)).toMatch(DENIED);
    });
});

describe('a role with the order right but not the counterparty right', () => {
    it('gets 0 from the powers-of-attorney count and is denied the list', async () => {
        const base = inject('accessBaseUrl');
        const root = await staffToken('superadmin');
        const email = 'poa-orders-only@access.test';
        const password = 'access-test-password';
        const call = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
            gqlOk<T>(base, 'admin-api', query, variables, root);
        const role = await call<{ createRole: { id: string } }>(
            `mutation($i: CreateRoleInput!) { createRole(input: $i) { id } }`,
            {
                i: {
                    code: 'poa-orders-only',
                    description: 'ReadOrder only',
                    permissions: ['ReadOrder'],
                },
            },
        );
        const created = await call<{ createAdministrator: { id: string } }>(
            `mutation($i: CreateAdministratorInput!) { createAdministrator(input: $i) { id } }`,
            {
                i: {
                    firstName: 'Poa',
                    lastName: 'Orders',
                    emailAddress: email,
                    password,
                    roleIds: [role.createRole.id],
                },
            },
        );
        try {
            const token = await login(base, 'admin-api', email, password);
            const counterpartyId = seed().counterparties[CUSTOMERS[0].counterparty];
            const counts = await admin<{ relatedErpDocumentCounts: { powersOfAttorney: number } }>(
                token,
                COUNTS,
                { cp: counterpartyId },
            );
            expect(counts.errors).toEqual([]);
            expect(counts.data!.relatedErpDocumentCounts.powersOfAttorney).toBe(0);
            const list = await admin(token, LIST, { l: {} });
            expect(JSON.stringify(list.errors)).toMatch(DENIED);
        } finally {
            await call(`mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`, {
                id: created.createAdministrator.id,
            });
            await call(`mutation($id: ID!) { deleteRole(id: $id) { result } }`, {
                id: role.createRole.id,
            });
        }
    });
});
