import { computed, ref, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AppSidebarItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import type { SearchHit } from '../api/globalSearch';
import {
    addRecent,
    loadRecent,
    recentSearchesKey,
    removeRecent,
    saveRecent,
} from '../utils/recentSearches';
import { searchHitKey, searchTarget } from '../utils/searchTarget';
import type { SearchShortcut } from '../components/layout/SearchPanel.vue';
import { useGlobalSearchResults } from './useGlobalSearchResults';

export function useHeaderSearch(menuItems: Ref<AppSidebarItem[]>) {
    const router = useRouter();
    const authStore = useAuthStore();
    const query = ref('');
    const results = useGlobalSearchResults(query);
    const administratorId = computed(() => authStore.administrator?.id ?? '');
    const recent = ref<string[]>([]);
    watch(
        administratorId,
        id => {
            recent.value = id ? loadRecent(recentSearchesKey(id)) : [];
        },
        { immediate: true },
    );

    function update(next: string[]): void {
        recent.value = next;
        if (administratorId.value) saveRecent(recentSearchesKey(administratorId.value), next);
    }

    const flat = computed(() =>
        results.groups.value.flatMap(group => group.items.map(hit => ({ kind: group.kind, hit }))),
    );
    const activeIndex = ref(-1);
    watch(flat, () => (activeIndex.value = -1));
    const activeKey = computed(() => {
        const entry = flat.value[activeIndex.value];
        return entry ? searchHitKey(entry.kind, entry.hit) : null;
    });

    function run(text: string): void {
        query.value = text;
        update(addRecent(recent.value, text));
    }

    function select(kind: string, hit: SearchHit): void {
        const target = searchTarget(kind, hit);
        update(addRecent(recent.value, query.value));
        query.value = '';
        if (target) void router.push(target);
    }

    function onKeydown(event: KeyboardEvent): void {
        const count = flat.value.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!count) return;
            event.preventDefault();
            const next = activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1);
            activeIndex.value = next >= count ? -1 : next < -1 ? count - 1 : next;
        } else if (event.key === 'Enter') {
            const entry = flat.value[activeIndex.value];
            if (entry) {
                event.preventDefault();
                select(entry.kind, entry.hit);
            } else if (query.value.trim()) run(query.value);
        }
    }

    const shortcuts = computed<SearchShortcut[]>(() =>
        menuItems.value
            .flatMap(item => item.children ?? [item])
            .flatMap(item => (item.path ? [{ label: item.label, path: item.path }] : [])),
    );

    const state = computed(() => ({
        groups: results.groups.value,
        active: results.active.value,
        pending: results.pending.value,
        failed: results.failed.value,
        tooShort: results.tooShort.value,
        empty: results.empty.value,
    }));

    return {
        query,
        recent,
        shortcuts,
        state,
        activeKey,
        run,
        select,
        onKeydown,
        remove: (text: string): void => update(removeRecent(recent.value, text)),
        clear: (): void => update([]),
        open: (path: string): void => void router.push(path),
    };
}
