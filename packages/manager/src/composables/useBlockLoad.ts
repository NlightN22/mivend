import { ref, type Ref } from 'vue';
import { i18n } from '../i18n';

export interface BlockLoad<T> {
    data: Ref<T | null>;
    loading: Ref<boolean>;
    error: Ref<string | null>;
    load: () => Promise<void>;
}

// A failed read keeps data null and sets error, so a block never shows a failure as an empty or zero value.
export function useBlockLoad<T>(loader: () => Promise<T>): BlockLoad<T> {
    const data = ref<T | null>(null) as Ref<T | null>;
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(): Promise<void> {
        loading.value = true;
        try {
            data.value = await loader();
            error.value = null;
        } catch (e) {
            data.value = null;
            error.value =
                e instanceof Error && e.message
                    ? e.message
                    : i18n.global.t('common.blockLoadUnknown');
        } finally {
            loading.value = false;
        }
    }

    return { data, loading, error, load };
}
