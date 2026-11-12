import { computed, inject, type ComputedRef, type InjectionKey, type Ref } from 'vue';

export const UI_LOCALE_KEY: InjectionKey<Ref<string>> = Symbol('mv-ui-locale');

// An app provides its active regional tag; without one dates stay day-first (en-GB).
export function useUiLocale(): ComputedRef<string> {
    const provided = inject(UI_LOCALE_KEY, null);
    return computed(() => provided?.value ?? 'en-GB');
}
