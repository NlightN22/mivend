import { watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { withUrlSearch } from '../utils/urlSearch';

// An outside navigation (header search, back/forward) changes the URL while the list stays mounted.
export function useUrlSearchParam<T extends { search: string }>(
    filters: Ref<T>,
    urlPrefix: string,
): void {
    const route = useRoute();
    const listPath = route.path;
    watch(
        () => route.query[`${urlPrefix}search`],
        urlSearch => {
            if (route.path !== listPath) return;
            const next = withUrlSearch(filters.value, urlSearch);
            if (next) filters.value = next;
        },
    );
}
