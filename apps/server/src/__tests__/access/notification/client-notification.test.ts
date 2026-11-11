import { describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, shop, staffToken } from '../harness/actors';

const CREATE = `mutation($input: ClientNotificationInput!) {
    createClientNotification(input: $input) { id message status } }`;
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
