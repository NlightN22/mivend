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
});
