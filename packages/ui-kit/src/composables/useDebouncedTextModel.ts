import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useDebouncedCallback } from './useDebouncedCallback';

export interface DebouncedTextModel {
    text: Ref<string>;
    input: (value: string) => void;
    clear: () => void;
    flush: () => void;
}

// While an edit is pending, an incoming model value (the echo of an earlier commit) must not
// overwrite what the user has typed since.
export function useDebouncedTextModel(
    getModel: () => string,
    commit: (value: string) => void,
    delayMs?: number,
): DebouncedTextModel {
    const text = ref(getModel());
    let pending = false;

    watch(getModel, v => {
        if (!pending && v !== text.value) text.value = v;
    });

    function flush(): void {
        if (!pending) return;
        pending = false;
        if (text.value !== getModel()) commit(text.value);
    }

    const schedule = useDebouncedCallback(flush, delayMs);
    onBeforeUnmount(flush);

    return {
        text,
        input(value: string) {
            text.value = value;
            pending = true;
            schedule();
        },
        clear() {
            pending = false;
            text.value = '';
            commit('');
        },
        flush,
    };
}
