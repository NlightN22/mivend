import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export interface UseLineSelection {
    selected: Ref<Set<string>>;
    active: Ref<boolean>;
    count: ComputedRef<number>;
    allSelected: ComputedRef<boolean>;
    toggle: (id: string) => void;
    setAll: (on: boolean) => void;
    clear: () => void;
}

// Selection state only; the entry gesture (checkbox column today, long-press on a phone) is the caller's.
export function useLineSelection(ids: Ref<string[]>): UseLineSelection {
    const selected = ref<Set<string>>(new Set());
    const active = ref(false);

    const count = computed(() => selected.value.size);
    const allSelected = computed(() => ids.value.length > 0 && count.value === ids.value.length);

    function toggle(id: string): void {
        const next = new Set(selected.value);
        if (!next.delete(id)) next.add(id);
        selected.value = next;
    }

    function setAll(on: boolean): void {
        selected.value = on ? new Set(ids.value) : new Set();
    }

    function clear(): void {
        selected.value = new Set();
        active.value = false;
    }

    watch(ids, list => {
        selected.value = new Set([...selected.value].filter(id => list.includes(id)));
    });

    return { selected, active, count, allSelected, toggle, setAll, clear };
}
