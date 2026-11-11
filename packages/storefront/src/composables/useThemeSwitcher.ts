import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    themePreference as preference,
    setThemePreference,
    type ThemeOption,
    type ThemePreference,
} from '@mivend/ui-kit';

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
