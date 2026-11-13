import { watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { createOwnSearchTracker, withUrlSearch } from '../utils/urlSearch';

// An outside navigation (header search, back/forward) changes the URL while the list stays mounted.
// Route updates echoing the list's own typed searches are ignored, so a late older one cannot win.
export function useUrlSearchParam<T extends { search: string }>(
    filters: Ref<T>,
    urlPrefix: string,
): void {
    const route = useRoute();
    const listPath = route.path;
    const own = createOwnSearchTracker();
    let applyingUrl = false;
    watch(
        () => filters.value.search,
        search => {
            if (!applyingUrl) own.typed(search);
        },
        { flush: 'sync' },
    );
    watch(
        () => route.query[`${urlPrefix}search`],
        urlSearch => {
            if (route.path !== listPath) return;
            if (own.isOwnEcho(urlSearch)) return;
            own.reset();
            const next = withUrlSearch(filters.value, urlSearch);
            if (!next) return;
            applyingUrl = true;
            filters.value = next;
            applyingUrl = false;
        },
    );
}
