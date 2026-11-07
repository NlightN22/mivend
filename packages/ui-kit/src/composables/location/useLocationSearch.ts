import { ref } from 'vue';
import type { GeoPoint, GeoSuggestion, SearchFn } from '../../components/MvLocationPicker/types';
import { useLatestRequest } from '../useLatestRequest';

export const MIN_QUERY_LENGTH = 3;

export function useLocationSearch(options: {
    search: SearchFn;
    getBias: () => GeoPoint | null;
    getProvider: () => string;
    debounceMs?: number;
}) {
    const query = ref('');
    const suggestions = ref<GeoSuggestion[]>([]);
    const failed = ref(false);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const { run, cancel, loading } = useLatestRequest(
        async (text: string) => {
            try {
                return {
                    items: await options.search(text, options.getBias(), options.getProvider()),
                    ok: true,
                };
            } catch {
                return { items: [] as GeoSuggestion[], ok: false };
            }
        },
        result => {
            suggestions.value = result.items;
            failed.value = !result.ok;
        },
    );

    function clear(): void {
        clearTimeout(timer);
        cancel();
        suggestions.value = [];
    }

    function onInput(text: string): void {
        query.value = text;
        clearTimeout(timer);
        if (text.trim().length < MIN_QUERY_LENGTH) {
            clear();
            return;
        }
        timer = setTimeout(() => void run(text.trim()), options.debounceMs ?? 350);
    }

    function submit(): void {
        clearTimeout(timer);
        if (query.value.trim().length >= MIN_QUERY_LENGTH) void run(query.value.trim());
    }

    function dispose(): void {
        clear();
    }

    return { query, suggestions, failed, loading, onInput, submit, clear, dispose };
}
