import { inject, type InjectionKey, type Ref } from 'vue';

export const UI_LABELS_KEY: InjectionKey<Ref<Record<string, string>>> = Symbol('mv-ui-labels');

// An app provides translated labels by key; a component keeps its English text as the fallback.
export function useUiLabels(): (key: string, fallback: string) => string {
    const provided = inject(UI_LABELS_KEY, null);
    return (key, fallback) => provided?.value[key] ?? fallback;
}
