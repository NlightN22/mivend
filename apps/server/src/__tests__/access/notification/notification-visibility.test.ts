import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, staff, staffToken } from '../harness/actors';
import {
    NOTIFICATION_MARKER,
    ORDERS,
    STAFF,
    VISIBLE_ORDERS,
    notificationTitle,
    type ActorKey,
} from '../seed/fixture-plan';

const LIST = `query($s: String!) { notifications(options: { search: $s, take: 100 }) {
    totalItems items { id title status } } }`;
const READ = `mutation($id: ID!) { markNotificationRead(id: $id) { id } }`;
const RESOLVE = `mutation($id: ID!) { resolveNotification(id: $id, resolution: "access probe") { id } }`;

interface Row {
    id: string;
    title: string;
    status: string;
}

async function listed(token: string): Promise<{ total: number; rows: Row[] }> {
    const result = await admin<{ notifications: { totalItems: number; items: Row[] } }>(
        token,
        LIST,
        { s: NOTIFICATION_MARKER },
    );
    expect(result.errors).toEqual([]);
    return { total: result.data!.notifications.totalItems, rows: result.data!.notifications.items };
}

const ALL_TITLES = [...ORDERS.map(o => notificationTitle(o.key)), notificationTitle('general')];

describe.each(STAFF.map(s => s.key))('order broadcast notifications for %s', (key: ActorKey) => {
    let token: string;
    let superadminRows: Row[];
    const expected = [
        ...VISIBLE_ORDERS[key].map(o => notificationTitle(o)),
        notificationTitle('general'),
    ].sort();
    const hiddenTitles = ALL_TITLES.filter(t => !expected.includes(t));

    beforeAll(async () => {
        token = await staffToken(key);
        superadminRows = (await listed(await staffToken('superadmin'))).rows;
    });

    it('the superadmin sees every seeded broadcast', () => {
        expect(superadminRows.map(r => r.title).sort()).toEqual([...ALL_TITLES].sort());
    });

    it('lists exactly the broadcasts of the orders it sees, and the count matches', async () => {
        const own = await listed(token);
        expect(own.rows.map(r => r.title).sort()).toEqual(expected);
        expect(own.total).toBe(own.rows.length);
        if (staff(key).scope === 'all')
            expect(own.rows.map(r => r.id).sort()).toEqual(superadminRows.map(r => r.id).sort());
        else expect(hiddenTitles.length, 'a hidden broadcast exists').toBeGreaterThan(0);
    });

    if (staff(key).scope !== 'all')
        it('cannot mark read or resolve a hidden broadcast by id', async () => {
            for (const title of hiddenTitles) {
                const row = superadminRows.find(r => r.title === title)!;
                for (const mutation of [READ, RESOLVE]) {
                    const result = await admin(token, mutation, { id: row.id });
                    expect(result.errors.join(' '), `${title}`).toMatch(DENIED);
                }
            }
            const after = (await listed(await staffToken('superadmin'))).rows;
            for (const title of hiddenTitles)
                expect(after.find(r => r.title === title)!.status, title).toBe('unread');
        });
});
