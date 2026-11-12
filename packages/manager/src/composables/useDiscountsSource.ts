import { computed, type WritableComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export type DiscountsSource = 'erp' | 'requests';

export const DISCOUNTS_SOURCES: { key: DiscountsSource; label: string }[] = [
    { key: 'erp', label: 'ERP discounts' },
    { key: 'requests', label: 'Requests' },
];

// ERP is the default and stays out of the URL; urlPrefix namespaces the key inside a customer card tab.
export function useDiscountsSource(urlPrefix = ''): WritableComputedRef<DiscountsSource> {
    const route = useRoute();
    const router = useRouter();
    const key = `${urlPrefix}source`;
    return computed<DiscountsSource>({
        get: () => (route.query[key] === 'requests' ? 'requests' : 'erp'),
        set: value => {
            const query = { ...route.query };
            if (value === 'erp') delete query[key];
            else query[key] = value;
            void router.replace({ query });
        },
    });
}
