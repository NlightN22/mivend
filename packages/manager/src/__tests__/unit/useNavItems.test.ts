import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useNavItems } from '../../composables/useNavItems';

const granted = new Set<string>();
vi.mock('../../stores/auth', () => ({
    useAuthStore: () => ({ hasPermission: (p: string) => granted.has(p) }),
}));

function flatLabels(): { sidebar: string[]; sheet: string[] } {
    const { menuItems, moreSheetItems } = useNavItems(ref(0));
    return {
        sidebar: menuItems.value.flatMap(i => [i.label, ...(i.children ?? []).map(c => c.label)]),
        sheet: moreSheetItems.value.map(i => i.label),
    };
}

describe('useNavItems', () => {
    it('never lists Payments, even for a holder of ReadPayment', () => {
        granted.clear();
        granted.add('ReadPayment');
        const { sidebar, sheet } = flatLabels();
        expect(sidebar).not.toContain('Payments');
        expect(sheet).not.toContain('Payments');
    });

    it('labels the system-level entry System settings in both menus', () => {
        granted.clear();
        granted.add('ManageAccessControl');
        const { sidebar, sheet } = flatLabels();
        expect(sidebar).toContain('System settings');
        expect(sheet).toContain('System settings');
        expect(sidebar).not.toContain('Settings');
        expect(sheet).not.toContain('Settings');
    });

    it('lists Analytics in both menus only with ReadAnalytics', () => {
        granted.clear();
        expect(flatLabels().sidebar).not.toContain('Analytics');
        expect(flatLabels().sheet).not.toContain('Analytics');
        granted.add('ReadAnalytics');
        expect(flatLabels().sidebar).toContain('Analytics');
        expect(flatLabels().sheet).toContain('Analytics');
    });

    it('shows a staff-accounts-only user the dashboard and System settings, nothing about sales', () => {
        granted.clear();
        granted.add('ManageAdministratorLifecycle');
        const { sidebar, sheet } = flatLabels();
        expect(sidebar).toEqual(['Dashboard', 'System settings']);
        expect(sheet).toEqual(['System settings']);
    });

    it('lists sales entries with the order and customer rights', () => {
        granted.clear();
        granted.add('ReadOrder');
        granted.add('ReadCustomer');
        const { sidebar } = flatLabels();
        for (const label of ['Customers', 'Orders', 'Approvals', 'Team', 'Discounts'])
            expect(sidebar).toContain(label);
    });
});
