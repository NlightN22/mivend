import type { ThemePreference } from '@mivend/ui-kit';

export interface UserMenuItem {
    label: string;
    to: string;
}

export interface UserMenuGroup {
    label: string;
    items: UserMenuItem[];
}

// Only personal pages that exist; the security page hosts the password change and two-factor setup.
export const USER_MENU_GROUPS: UserMenuGroup[] = [
    {
        label: 'Account settings',
        items: [{ label: 'Password and two-factor sign-in', to: '/settings/security' }],
    },
];

export const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];
