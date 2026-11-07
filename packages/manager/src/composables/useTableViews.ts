import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { deleteTableView, fetchMyTableViews, saveTableView } from '../api/tableViews';
import {
    sameTableViewState,
    toStoredView,
    visibleColumnsOf,
    type StoredTableView,
    type TableViewState,
} from './tableViewState';

export interface TableViews {
    views: Ref<StoredTableView[]>;
    activeId: Ref<string>;
    dirty: ComputedRef<boolean>;
    busy: Ref<boolean>;
    init: () => Promise<void>;
    select: (id: string) => void;
    reset: () => void;
    create: (name: string) => Promise<void>;
    update: () => Promise<void>;
    rename: (id: string, name: string) => Promise<void>;
    duplicate: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
}

export interface UseTableViewsOptions {
    viewsKey: string;
    // Scopes the remembered choice to one person on a shared browser.
    ownerKey: string;
    capture: () => TableViewState;
    apply: (state: TableViewState) => void;
    // True when the page was opened with filters in its link; the link then wins over the remembered view.
    skipRestore?: () => boolean;
}

function readChoice(key: string): string {
    try {
        return localStorage.getItem(key) ?? '';
    } catch {
        return '';
    }
}
function writeChoice(key: string, id: string): void {
    try {
        if (id) localStorage.setItem(key, id);
        else localStorage.removeItem(key);
    } catch {
        // The choice is only a convenience; the view still applies for this visit.
    }
}

// Views are personal and stored per viewsKey; the last chosen view reopens with the list.
export function useTableViews(options: UseTableViewsOptions): TableViews {
    const choiceKey = `table-view:${options.viewsKey}:${options.ownerKey}`;
    const views = ref<StoredTableView[]>([]);
    const activeId = ref('');
    const busy = ref(false);
    // Bumped on every apply so `dirty` recomputes against the table's new state.
    const tick = ref(0);

    const active = computed(() => views.value.find(v => v.id === activeId.value));
    const dirty = computed(() => {
        void tick.value;
        return active.value ? !sameTableViewState(active.value.state, options.capture()) : false;
    });

    function choose(id: string): void {
        activeId.value = id;
        writeChoice(choiceKey, id);
    }

    function select(id: string): void {
        choose(id);
        const view = views.value.find(v => v.id === id);
        if (view) options.apply(view.state);
        tick.value++;
    }

    function reset(): void {
        if (active.value) options.apply(active.value.state);
        tick.value++;
    }

    async function load(): Promise<void> {
        const saved = await fetchMyTableViews(options.viewsKey);
        views.value = saved.map(toStoredView).filter((v): v is StoredTableView => v !== null);
    }

    async function persist(name: string, state: TableViewState): Promise<string> {
        const saved = await saveTableView(
            options.viewsKey,
            name,
            JSON.stringify(state),
            visibleColumnsOf(state),
        );
        return saved.id;
    }

    async function guarded(work: () => Promise<void>): Promise<void> {
        busy.value = true;
        try {
            await work();
            await load();
        } finally {
            busy.value = false;
        }
    }

    async function create(name: string): Promise<void> {
        await guarded(async () => choose(await persist(name, options.capture())));
        tick.value++;
    }

    // The server has no update call: save the new state first, then drop the old row.
    async function replace(
        view: StoredTableView,
        name: string,
        state: TableViewState,
    ): Promise<void> {
        const id = await persist(name, state);
        await deleteTableView(view.id);
        if (activeId.value === view.id) choose(id);
    }

    async function update(): Promise<void> {
        const view = active.value;
        if (!view) return;
        await guarded(() => replace(view, view.name, options.capture()));
        tick.value++;
    }

    async function rename(id: string, name: string): Promise<void> {
        const view = views.value.find(v => v.id === id);
        if (view) await guarded(() => replace(view, name, view.state));
    }

    async function duplicate(id: string): Promise<void> {
        const view = views.value.find(v => v.id === id);
        if (view)
            await guarded(async () => void (await persist(`${view.name} (copy)`, view.state)));
    }

    async function remove(id: string): Promise<void> {
        await guarded(async () => {
            await deleteTableView(id);
            if (activeId.value === id) choose('');
        });
    }

    async function init(): Promise<void> {
        await load();
        const remembered = readChoice(choiceKey);
        if (!views.value.some(v => v.id === remembered)) return;
        if (options.skipRestore?.()) activeId.value = remembered;
        else select(remembered);
    }

    return {
        views,
        activeId,
        dirty,
        busy,
        init,
        select,
        reset,
        create,
        update,
        rename,
        duplicate,
        remove,
    };
}
