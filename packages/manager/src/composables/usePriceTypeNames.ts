import { ref, type Ref } from 'vue';
import { fetchPriceTypeOptions } from '../api/branchSettings';

const names = ref<Map<string, string>>(new Map());
let loading: Promise<void> | null = null;

// Code -> display name, fetched once per session; a failed fetch leaves the names empty.
export function usePriceTypeNames(): {
    names: Ref<Map<string, string>>;
    load: () => Promise<void>;
} {
    function load(): Promise<void> {
        loading ??= fetchPriceTypeOptions()
            .then(list => {
                names.value = new Map(list.map(p => [p.code, p.name]));
            })
            .catch(() => {
                loading = null;
            });
        return loading;
    }
    return { names, load };
}
