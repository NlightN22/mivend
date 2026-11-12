import { IconMoon, IconSun, IconSunMoon, IconShieldLock } from '@tabler/icons-vue';
import type { Component } from 'vue';
import type { ThemePreference } from '@mivend/ui-kit';

export interface UserMenuItem {
    labelKey: string;
    to: string;
    icon: Component;
}

// Only personal pages that exist; the security page hosts the password change and two-factor setup.
export const USER_MENU_ITEMS: UserMenuItem[] = [
    { labelKey: 'shell.userMenu.passwordAndSecurity', to: '/settings/security', icon: IconShieldLock },
];

export const THEME_CHOICES: { value: ThemePreference; labelKey: string; icon: Component }[] = [
    { value: 'light', labelKey: 'shell.userMenu.themeLight', icon: IconSun },
    { value: 'dark', labelKey: 'shell.userMenu.themeDark', icon: IconMoon },
    { value: 'system', labelKey: 'shell.userMenu.themeAuto', icon: IconSunMoon },
];

export function systemSettingsPath(hasPermission: (name: string) => boolean): string | null {
    if (hasPermission('ManageAccessControl')) return '/settings';
    if (hasPermission('ManageVisibilityGrants')) return '/settings/visibility-grants';
    return null;
}
