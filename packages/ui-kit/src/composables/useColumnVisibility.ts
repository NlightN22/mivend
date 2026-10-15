import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export interface ColumnVisibilityDef {
    key: string;
    label: string;
    // Omit required columns from the hideable set entirely (not just pre-checked), so users
    // cannot hide the column they need to navigate, e.g. the row's primary identifier.
    required?: boolean;
}

// Per-admin UI preference, not domain data, so it lives in localStorage with no backend entity.
// storageKey must be unique per table and admin, e.g. `orders-columns:${administratorId}`.
export function useColumnVisibility(
    storageKey: string,
    columns: ColumnVisibilityDef[],
): {
    hiddenKeys: Ref<Set<string>>;
    toggle: (key: string) => void;
    toggleableColumns: ComputedRef<(ColumnVisibilityDef & { visible: boolean })[]>;
} {
    const hideable = columns.filter(c => !c.required);
    const stored = (() => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? (JSON.parse(raw) as string[]) : null;
        } catch {
            return null;
        }
    })();

    const hiddenKeys: Ref<Set<string>> = ref(new Set(stored ?? []));

    watch(
        hiddenKeys,
        value => {
            try {
                localStorage.setItem(storageKey, JSON.stringify([...value]));
            } catch {
                // Personal display preference only — a full/unavailable localStorage just means
                // the toggle doesn't persist across reloads this session, nothing else breaks.
            }
        },
        { deep: true },
    );

    function toggle(key: string): void {
        const next = new Set(hiddenKeys.value);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        hiddenKeys.value = next;
    }

    const toggleableColumns = computed(() =>
        hideable.map(c => ({ ...c, visible: !hiddenKeys.value.has(c.key) })),
    );

    return { hiddenKeys, toggle, toggleableColumns };
}
