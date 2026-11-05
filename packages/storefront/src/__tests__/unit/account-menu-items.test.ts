import { describe, expect, it } from 'vitest';
import { buildAccountMenu } from '../../composables/accountMenuItems';

const keys = (nodes: { key: string }[]): string[] => nodes.map(n => n.key);

describe('buildAccountMenu', () => {
    it('lists every sidebar entry when demo data is allowed', () => {
        expect(keys(buildAccountMenu(true))).toEqual([
            'home',
            'orders',
            'statement',
            'documents',
            'favorites',
            'requests',
            'tradingPoints',
            'balance',
            'employees',
            'settings',
            'notifications',
        ]);
    });

    it('drops demo-only entries in production, including the document child', () => {
        const menu = buildAccountMenu(false);
        const all = menu.flatMap(n => [n.to, ...(n.children?.map(c => c.to) ?? [])]);
        expect(all).not.toContain('/requests');
        expect(all).not.toContain('/account/employees');
        expect(all).not.toContain('/reconciliation-acts');
        expect(menu.find(n => n.key === 'documents')?.children).toHaveLength(2);
    });

    it('omits entries that already have a header or tab-bar slot', () => {
        const menu = keys(buildAccountMenu(true, ['orders', 'favorites', 'home']));
        expect(menu).not.toContain('orders');
        expect(menu).not.toContain('favorites');
        expect(menu).not.toContain('home');
        expect(menu).toContain('documents');
    });

    it('has no duplicate keys or targets', () => {
        const menu = buildAccountMenu(true);
        const targets = menu.flatMap(n => (n.to ? [n.to] : (n.children ?? []).map(c => c.to)));
        expect(new Set(targets).size).toBe(targets.length);
        expect(new Set(keys(menu)).size).toBe(menu.length);
    });
});
