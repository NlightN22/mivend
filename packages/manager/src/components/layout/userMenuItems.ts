import { IconMoon, IconSun, IconSunMoon, IconShieldLock } from '@tabler/icons-vue';
import type { Component } from 'vue';
import type { ThemePreference } from '@mivend/ui-kit';

export interface UserMenuItem {
    label: string;
    to: string;
    icon: Component;
}

// Only personal pages that exist; the security page hosts the password change and two-factor setup.
export const USER_MENU_ITEMS: UserMenuItem[] = [
    { label: 'Password and security', to: '/settings/security', icon: IconShieldLock },
];

export const THEME_CHOICES: { value: ThemePreference; label: string; icon: Component }[] = [
    { value: 'light', label: 'Light', icon: IconSun },
    { value: 'dark', label: 'Dark', icon: IconMoon },
    { value: 'system', label: 'Auto', icon: IconSunMoon },
];

export function systemSettingsPath(hasPermission: (name: string) => boolean): string | null {
    if (hasPermission('ManageAccessControl')) return '/settings';
    if (hasPermission('ManageVisibilityGrants')) return '/settings/visibility-grants';
    return null;
}
