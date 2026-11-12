import { describe, expect, it } from 'vitest';
import enApprovals from '../../i18n/en/approvals';
import ruApprovals from '../../i18n/ru/approvals';
import enNotifications from '../../i18n/en/notifications';
import ruNotifications from '../../i18n/ru/notifications';
import enTeam from '../../i18n/en/team';
import ruTeam from '../../i18n/ru/team';
import enChangeJournal from '../../i18n/en/changeJournal';
import ruChangeJournal from '../../i18n/ru/changeJournal';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe.each([
    ['approvals', enApprovals, ruApprovals],
    ['notifications', enNotifications, ruNotifications],
    ['team', enTeam, ruTeam],
    ['changeJournal', enChangeJournal, ruChangeJournal],
])('%s catalogue', (_name, en, ru) => {
    it('has the same keys in en and ru', () => {
        expect(keys(ru).sort()).toEqual(keys(en).sort());
    });
});
