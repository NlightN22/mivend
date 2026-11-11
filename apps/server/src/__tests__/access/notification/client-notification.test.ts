import { describe, expect, inject, it } from 'vitest';

import { DENIED, admin, customerToken, seed, shop, staffToken } from '../harness/actors';
import { gql } from '../harness/graphql';

const CREATE = `mutation($input: ClientNotificationInput!) {
    createClientNotification(input: $input) { id message status } }`;
const ACTING = { 'x-acting-session': '1' };
const LIST = `query($s: String!) { notifications(options: { search: $s, take: 100 }) {
    totalItems items { id message } } }`;
const READ = `mutation($id: ID!) { markNotificationRead(id: $id) { id } }`;

const marker = `client-popup-${Date.now()}`;
const input = (who: string) => ({ kind: 'error', title: '', message: `${marker} ${who}` });

interface Listed {
    notifications: { totalItems: number; items: Array<{ id: string; message: string }> };
}

describe('createClientNotification keeps each caller to their own rows', () => {
    it('staff: an administrator lists only their own popup and cannot act on another one', async () => {
        const [a, b] = [await staffToken('manager-a'), await staffToken('manager-b')];
        const created = await admin<{ createClientNotification: { id: string } }>(a, CREATE, {
            input: input('staff-a'),
        });
        expect(created.errors).toEqual([]);
        await admin(b, CREATE, { input: input('staff-b') });

        const listedA = await admin<Listed>(a, LIST, { s: marker });
        const listedB = await admin<Listed>(b, LIST, { s: marker });

        expect(listedA.data!.notifications.items.map(i => i.message)).toEqual([
            `${marker} staff-a`,
        ]);
        expect(listedB.data!.notifications.items.map(i => i.message)).toEqual([
            `${marker} staff-b`,
        ]);
        const denied = await admin(b, READ, { id: created.data!.createClientNotification.id });
        expect(denied.errors.join(' ')).toMatch(DENIED);
    });

    it('storefront: a customer lists only their own popup and cannot act on another one', async () => {
        const [a, b] = [await customerToken('customer-a'), await customerToken('customer-b')];
        const created = await shop<{ createClientNotification: { id: string } }>(a, CREATE, {
            input: input('customer-a'),
        });
        expect(created.errors).toEqual([]);
        await shop(b, CREATE, { input: input('customer-b') });

        const listedA = await shop<Listed>(a, LIST, { s: marker });
        const listedB = await shop<Listed>(b, LIST, { s: marker });

        expect(listedA.data!.notifications.items.map(i => i.message)).toEqual([
            `${marker} customer-a`,
        ]);
        expect(listedB.data!.notifications.items.map(i => i.message)).toEqual([
            `${marker} customer-b`,
        ]);
        const denied = await shop(b, READ, { id: created.data!.createClientNotification.id });
        expect(denied.errors.join(' ')).toMatch(DENIED);
    });

    it('refuses an anonymous caller and an oversized message', async () => {
        const anonymous = await shop('', CREATE, { input: input('anonymous') });
        expect(anonymous.errors.join(' ')).toMatch(DENIED);

        const token = await customerToken('customer-a');
        const tooLong = await shop(token, CREATE, {
            input: { kind: 'info', message: 'x'.repeat(1001) },
        });
        expect(tooLong.errors.length).toBeGreaterThan(0);
    });
});

describe('createClientNotification in an acting-as-customer session', () => {
    it('stores nothing in the real customer bell and answers null', async () => {
        const started = await admin<{ startActingSession: { ticket: string } }>(
            await staffToken('superadmin'),
            `mutation($c: ID!) { startActingSession(counterpartyId: $c) { ticket } }`,
            { c: seed().counterparties['a-own'] },
        );
        expect(started.errors).toEqual([]);
        const url = inject('accessBaseUrl');
        const exchanged = await gql<{ exchangeActingTicket: { token: string } }>(
            url,
            'shop-api',
            `mutation($t: String!) { exchangeActingTicket(ticket: $t) { token } }`,
            { t: started.data!.startActingSession.ticket },
            undefined,
            ACTING,
        );
        expect(exchanged.errors).toEqual([]);
        const token = exchanged.data!.exchangeActingTicket.token;
        const actingMarker = `${marker}-acting`;
        try {
            const created = await gql<{ createClientNotification: unknown }>(
                url,
                'shop-api',
                CREATE,
                { input: { kind: 'error', title: '', message: actingMarker } },
                token,
                ACTING,
            );
            const listed = await gql<Listed>(url, 'shop-api', LIST, { s: actingMarker }, token, ACTING);

            expect(created.errors).toEqual([]);
            expect(created.data!.createClientNotification).toBeNull();
            expect(listed.data!.notifications.totalItems).toBe(0);
        } finally {
            await gql(url, 'shop-api', `mutation { finishActingSession }`, {}, token, ACTING);
        }
    });
});
