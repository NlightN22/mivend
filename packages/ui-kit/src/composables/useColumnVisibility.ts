import { computed, ref, watch, type Ref } from 'vue';

export interface ColumnVisibilityDef {
    key: string;
    label: string;
    // Required columns never appear in the toggle list and can never be hidden (e.g. the row's
    // primary identifier / action column) — omit from the hideable set entirely, not just
    // pre-checked, so a user can't accidentally hide the one column they need to navigate.
    required?: boolean;
}

// Per-admin, per-table column visibility, persisted to localStorage — this is personal UI
// preference (which columns *I* want to see), not business data, so it doesn't need a backend
// entity (see AGENTS.md "business data must live in the database" — that rule is about domain
// facts, not per-user display preference). storageKey should be unique per table+admin, e.g.
// `orders-columns:${administratorId}`.
export function useColumnVisibility(storageKey: string, columns: ColumnVisibilityDef[]) {
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
