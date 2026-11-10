export interface SettingsNavItem {
    label: string;
    to: string;
}

export interface SettingsNavGroup {
    label: string;
    items: SettingsNavItem[];
}

interface SettingsNavEntry extends SettingsNavItem {
    // Same gate the page itself enforces; undefined means the page decides for itself.
    visible?: (has: (permission: string) => boolean) => boolean;
}

const GROUPS: Array<{ label: string; entries: SettingsNavEntry[] }> = [
    {
        label: 'Access',
        entries: [
            { label: 'Roles & access', to: '/settings/roles' },
            { label: 'Users', to: '/settings/users' },
            {
                label: 'Unsorted',
                to: '/settings/unsorted',
                visible: has => has('ManageVisibilityGrants') || has('ManageAccessControl'),
            },
            {
                label: 'Visibility grants',
                to: '/settings/visibility-grants',
                visible: has => has('ManageVisibilityGrants') || has('ManageAccessControl'),
            },
            { label: 'Security', to: '/settings/security' },
        ],
    },
    {
        label: 'Organization',
        entries: [
            { label: 'Branches', to: '/settings/branches' },
            {
                label: 'Departments to branch',
                to: '/settings/department-branch',
                visible: has => has('ManageAccessControl'),
            },
            { label: 'Organizations', to: '/settings/organizations' },
            { label: 'Category visibility', to: '/settings/category-visibility' },
            {
                label: 'Price type gaps',
                to: '/settings/price-type-gaps',
                visible: has => has('ReadCounterparty'),
            },
        ],
    },
    {
        label: 'System',
        entries: [
            {
                label: 'Controls and policies',
                to: '/settings/check-policies',
                visible: has => has('ManageCheckPolicies'),
            },
            {
                label: 'System health',
                to: '/settings/system-health',
                visible: has => has('ManageAccessControl') || has('ManageErpIntegration'),
            },
        ],
    },
];

export function buildSettingsNav(has: (permission: string) => boolean): SettingsNavGroup[] {
    return GROUPS.map(group => ({
        label: group.label,
        items: group.entries
            .filter(entry => !entry.visible || entry.visible(has))
            .map(({ label, to }) => ({ label, to })),
    })).filter(group => group.items.length > 0);
}
