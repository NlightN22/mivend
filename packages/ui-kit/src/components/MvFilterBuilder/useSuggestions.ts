import { onBeforeUnmount, ref, type Ref } from 'vue';

import type { FilterSuggest } from './filterBuilderTypes';

export type SuggestFetcher = FilterSuggest;

export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEBOUNCE_MS = 300;
export const SUGGEST_MAX_ITEMS = 10;

// Debounced typeahead state: a newer keystroke aborts the stale request and a sequence guard drops its late answer.
export function useSuggestions(fetcher: Ref<SuggestFetcher | undefined>) {
    const items = ref<string[]>([]);
    const active = ref(-1);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let sequence = 0;

    function cancel(): void {
        sequence += 1;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        controller?.abort();
        controller = undefined;
    }

    function close(): void {
        cancel();
        items.value = [];
        active.value = -1;
    }

    async function load(text: string): Promise<void> {
        const mine = ++sequence;
        controller = new AbortController();
        try {
            const found = await fetcher.value!(text, controller.signal);
            if (mine !== sequence) return;
            items.value = found.slice(0, SUGGEST_MAX_ITEMS);
        } catch {
            if (mine !== sequence) return;
            items.value = [];
        }
        active.value = -1;
    }

    function query(raw: string): void {
        cancel();
        const text = raw.trim();
        if (!fetcher.value || text.length < SUGGEST_MIN_CHARS) {
            items.value = [];
            active.value = -1;
            return;
        }
        timer = setTimeout(() => void load(text), SUGGEST_DEBOUNCE_MS);
    }

    function move(step: 1 | -1): void {
        const count = items.value.length;
        if (step === 1) active.value = active.value + 1 >= count ? 0 : active.value + 1;
        else active.value = active.value <= 0 ? count - 1 : active.value - 1;
    }

    // Returns true when the key was consumed (the caller must not let the form see it).
    function onKey(event: KeyboardEvent, pick: (value: string) => void): boolean {
        if (!items.value.length) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            move(event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Enter' && active.value >= 0) {
            pick(items.value[active.value]!);
            close();
        } else if (event.key === 'Escape') {
            close();
        } else {
            return false;
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    onBeforeUnmount(cancel);
    return { items, active, query, close, onKey };
}
