import type { ThemePreference } from '@mivend/ui-kit';

export interface UserMenuItem {
    label: string;
    to: string;
}

// Only personal pages that exist; the security page hosts the password change and two-factor setup.
export const USER_MENU_ITEMS: UserMenuItem[] = [
    { label: 'Password and security', to: '/settings/security' },
];

export const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Auto' },
];

export function systemSettingsPath(hasPermission: (name: string) => boolean): string | null {
    if (hasPermission('ManageAccessControl')) return '/settings';
    if (hasPermission('ManageVisibilityGrants')) return '/settings/visibility-grants';
    return null;
}
