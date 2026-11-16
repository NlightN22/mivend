import { describe, expect, it } from 'vitest';

import {
    PORTAL_STATES,
    PORTAL_STATE_CASE_SQL,
    PORTAL_STATE_RANK_SQL,
} from '../../counterparty-portal-state.sql';

describe('portal state SQL (#375)', () => {
    it('names the four account states in ascending order', () => {
        expect(PORTAL_STATES).toEqual(['none', 'invited', 'verified', 'active']);
    });

    it('the value and the sort rank use the same branches in the same order', () => {
        PORTAL_STATES.forEach((state, index) => {
            expect(PORTAL_STATE_CASE_SQL).toContain(`THEN '${state}'`);
            expect(PORTAL_STATE_RANK_SQL).toContain(`THEN ${index}`);
        });
    });

    it('keeps the branches exclusive: only signed-in logins are active, the others require no sign-in', () => {
        expect(PORTAL_STATE_CASE_SQL.split('u."lastLogin" IS NOT NULL')).toHaveLength(2);
        expect(PORTAL_STATE_CASE_SQL.split('u."lastLogin" IS NULL')).toHaveLength(3);
    });

    it('reads only the live customer and a live user', () => {
        expect(PORTAL_STATE_CASE_SQL).toContain('cu."deletedAt" IS NULL');
        expect(PORTAL_STATE_CASE_SQL).toContain('u."deletedAt" IS NULL');
    });
});
