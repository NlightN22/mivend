import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
    deleteTableView,
    fetchTableViews,
    saveTableView,
    setTableViewDefault,
    updateTableView,
    type SavedTableViewScope,
} from '../api/tableViews';
import {
    BUILT_IN_CHOICE,
    initialViewId,
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
    create: (name: string, scope?: SavedTableViewScope) => Promise<void>;
    update: () => Promise<void>;
    rename: (id: string, name: string) => Promise<void>;
    duplicate: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    setDefault: (id: string, value: boolean) => Promise<void>;
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

// Views are stored per viewsKey, personal or team-wide. On open: link filters, then the person's
// last choice, then the team default.
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
        writeChoice(choiceKey, id || BUILT_IN_CHOICE);
    }

    function forget(): void {
        activeId.value = '';
        writeChoice(choiceKey, '');
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
        const saved = await fetchTableViews(options.viewsKey);
        views.value = saved.map(toStoredView).filter((v): v is StoredTableView => v !== null);
    }

    async function persist(
        name: string,
        state: TableViewState,
        scope: SavedTableViewScope = 'PERSONAL',
    ): Promise<string> {
        const saved = await saveTableView(
            options.viewsKey,
            name,
            JSON.stringify(state),
            visibleColumnsOf(state),
            scope,
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

    async function create(name: string, scope: SavedTableViewScope = 'PERSONAL'): Promise<void> {
        await guarded(async () => choose(await persist(name, options.capture(), scope)));
        tick.value++;
    }

    async function update(): Promise<void> {
        const view = active.value;
        if (!view) return;
        const state = options.capture();
        await guarded(async () => {
            await updateTableView(view.id, {
                filters: JSON.stringify(state),
                visibleColumns: visibleColumnsOf(state),
            });
        });
        tick.value++;
    }

    async function rename(id: string, name: string): Promise<void> {
        await guarded(async () => void (await updateTableView(id, { name })));
    }

    // A copy is always personal, so anyone can start from a team view.
    async function duplicate(id: string): Promise<void> {
        const view = views.value.find(v => v.id === id);
        if (view)
            await guarded(async () => void (await persist(`${view.name} (copy)`, view.state)));
    }

    async function remove(id: string): Promise<void> {
        await guarded(async () => {
            await deleteTableView(id);
            if (activeId.value === id) forget();
        });
    }

    async function setDefault(id: string, value: boolean): Promise<void> {
        await guarded(async () => void (await setTableViewDefault(id, value)));
    }

    async function init(): Promise<void> {
        await load();
        const remembered = readChoice(choiceKey);
        if (options.skipRestore?.()) {
            if (views.value.some(v => v.id === remembered)) activeId.value = remembered;
            return;
        }
        const id = initialViewId(views.value, remembered);
        if (id) select(id);
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
        setDefault,
    };
}
