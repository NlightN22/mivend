import { computed, type ComputedRef } from 'vue';
import type { LanguageOption } from '@mivend/ui-kit';
import { i18n, setLocale } from '../i18n';
import { SUPPORTED_LOCALES, flagRegion, nativeName } from '../i18n/locales';

const OPTIONS: LanguageOption[] = SUPPORTED_LOCALES.map(code => ({
    code,
    nativeName: nativeName(code),
    flagRegion: flagRegion(code),
}));

export function useLanguageSwitcher(): {
    locale: ComputedRef<string>;
    options: LanguageOption[];
    select: (code: string) => Promise<void>;
} {
    return {
        locale: computed(() => i18n.global.locale.value),
        options: OPTIONS,
        select: setLocale,
    };
}
