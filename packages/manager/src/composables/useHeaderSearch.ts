import { computed, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AppSidebarItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { addRecent, loadRecent, removeRecent, saveRecent } from '../utils/recentSearches';
import type { SearchShortcut } from '../components/layout/SearchPanel.vue';

// No search backend yet: submit opens the Customers list with the text as its search.
export function useHeaderSearch(menuItems: Ref<AppSidebarItem[]>) {
    const router = useRouter();
    const authStore = useAuthStore();
    const key = computed(
        () => `mivend.manager.recentSearches.${authStore.administrator?.id ?? ''}`,
    );
    const recent = ref<string[]>(loadRecent(key.value));

    function update(next: string[]): void {
        recent.value = next;
        saveRecent(key.value, next);
    }

    function run(query: string): void {
        update(addRecent(recent.value, query));
        void router.push({ path: '/customers', query: { search: query.trim() } });
    }

    const shortcuts = computed<SearchShortcut[]>(
        () =>
            menuItems.value.flatMap(item =>
                (item.children ?? [item]).filter(i => i.path),
            ) as SearchShortcut[],
    );

    return {
        recent,
        shortcuts,
        run,
        remove: (query: string): void => update(removeRecent(recent.value, query)),
        clear: (): void => update([]),
        open: (path: string): void => void router.push(path),
    };
}
