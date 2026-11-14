// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import enDashboard from '../../i18n/en/dashboardParts';
import ruDashboard from '../../i18n/ru/dashboardParts';
import { getDashboardKpiCards } from '../../api/dashboard-config';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

afterEach(() => setLocale('en'));

describe('dashboard catalogue', () => {
    it('has the same keys in en and ru', () => {
        expect(keys(ruDashboard).sort()).toEqual(keys(enDashboard).sort());
    });

    it('KPI card labels follow a language switch', async () => {
        const [card] = getDashboardKpiCards('manager');
        await setLocale('en');
        expect(card.label).toBe('Active orders');
        await setLocale('ru');
        expect(card.label).toBe('Активные заказы');
    });
});
