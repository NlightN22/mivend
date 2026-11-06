import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ThemeOption } from '@mivend/ui-kit';
import { preference, setThemePreference, type ThemePreference } from '../theme';

export function useThemeSwitcher(): {
    theme: ComputedRef<string>;
    options: ComputedRef<ThemeOption[]>;
    select: (value: string) => void;
} {
    const { t } = useI18n();
    return {
        theme: computed(() => preference.value),
        options: computed(() => [
            { value: 'system', label: t('nav.themeSystem') },
            { value: 'light', label: t('nav.themeLight') },
            { value: 'dark', label: t('nav.themeDark') },
        ]),
        select: value => setThemePreference(value as ThemePreference),
    };
}
