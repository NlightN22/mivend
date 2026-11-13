import { tr } from '../../utils/lazyLabels';

export interface SettingsNavItem {
    label: string;
    to: string;
}

export interface SettingsNavGroup {
    label: string;
    items: SettingsNavItem[];
}

interface SettingsNavEntry extends SettingsNavItem {
    // `label` is a settingsSystem.nav key. Same gate the page itself enforces; undefined means the page decides for itself.
    visible?: (has: (permission: string) => boolean) => boolean;
}

const GROUPS: Array<{ label: string; entries: SettingsNavEntry[] }> = [
    {
        label: 'access',
        entries: [
            { label: 'roles', to: '/settings/roles' },
            { label: 'users', to: '/settings/users' },
            {
                label: 'unsorted',
                to: '/settings/unsorted',
                visible: has => has('ManageVisibilityGrants') || has('ManageAccessControl'),
            },
            {
                label: 'visibilityGrants',
                to: '/settings/visibility-grants',
                visible: has => has('ManageVisibilityGrants') || has('ManageAccessControl'),
            },
            { label: 'security', to: '/settings/security' },
        ],
    },
    {
        label: 'organization',
        entries: [
            { label: 'branches', to: '/settings/branches' },
            {
                label: 'departmentBranch',
                to: '/settings/department-branch',
                visible: has => has('ManageAccessControl'),
            },
            { label: 'organizations', to: '/settings/organizations' },
            { label: 'categoryVisibility', to: '/settings/category-visibility' },
            {
                label: 'priceTypeGaps',
                to: '/settings/price-type-gaps',
                visible: has => has('ReadCounterparty'),
            },
        ],
    },
    {
        label: 'system',
        entries: [
            {
                label: 'checkPolicies',
                to: '/settings/check-policies',
                visible: has => has('ManageCheckPolicies'),
            },
            {
                label: 'systemHealth',
                to: '/settings/system-health',
                visible: has => has('ManageAccessControl') || has('ManageErpIntegration'),
            },
        ],
    },
];

export function buildSettingsNav(has: (permission: string) => boolean): SettingsNavGroup[] {
    return GROUPS.map(group => ({
        label: tr(`settingsSystem.nav.groups.${group.label}`),
        items: group.entries
            .filter(entry => !entry.visible || entry.visible(has))
            .map(({ label, to }) => ({ label: tr(`settingsSystem.nav.${label}`), to })),
    })).filter(group => group.items.length > 0);
}
