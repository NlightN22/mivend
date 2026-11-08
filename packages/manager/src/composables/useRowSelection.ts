import { computed, ref, watch, type Ref } from 'vue';

// Selection state only; the entry gesture (checkbox column today, long-press on a phone) is the caller's.
export function useRowSelection(ids: Ref<string[]>) {
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
