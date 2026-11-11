import { describe, expect, it } from 'vitest';

import { DENIED, admin, staffToken } from '../harness/actors';

const LIST = `query { notificationRetentionRules { totalItems items { id sourceType readDays unreadDays } } }`;
const UPDATE = `mutation($id: ID!, $input: NotificationRetentionRuleInput!) {
    updateNotificationRetentionRule(id: $id, input: $input) { id readDays unreadDays } }`;

interface Listed {
    notificationRetentionRules: {
        items: Array<{ id: string; sourceType: string; readDays: number | null }>;
    };
}

describe('notification retention rules (native settings permissions)', () => {
    it('a role without settings permissions can neither read nor change the rules', async () => {
        const token = await staffToken('manager-a');

        const read = await admin(token, LIST);
        const write = await admin(token, UPDATE, { id: '1', input: { readDays: 1 } });

        expect(read.errors.join(' ')).toMatch(DENIED);
        expect(write.errors.join(' ')).toMatch(DENIED);
    });

    it('the superadmin reads the seeded rules, and the server refuses invalid days', async () => {
        const token = await staffToken('superadmin');
        const listed = await admin<Listed>(token, LIST);
        expect(listed.errors).toEqual([]);
        const rules = listed.data!.notificationRetentionRules.items;
        const fallback = rules.find(r => r.sourceType === '*')!;

        const invalid = await admin(token, UPDATE, {
            id: fallback.id,
            input: { readDays: 0, unreadDays: 5 },
        });
        const cleared = await admin(token, UPDATE, {
            id: fallback.id,
            input: { readDays: null, unreadDays: 5 },
        });

        expect(rules.map(r => r.sourceType)).toEqual(expect.arrayContaining(['*', 'client']));
        expect(invalid.errors.join(' ')).toMatch(/readDays/);
        expect(cleared.errors.join(' ')).toMatch(/default rule/);
    });
});
