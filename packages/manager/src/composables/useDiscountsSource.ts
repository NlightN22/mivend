import { computed, type WritableComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { i18n } from '../i18n';

export type DiscountsSource = 'erp' | 'requests';

export const DISCOUNTS_SOURCES: { key: DiscountsSource; readonly label: string }[] = (
    ['erp', 'requests'] as const
).map(key => ({
    key,
    get label(): string {
        return i18n.global.t(`discounts.source.${key}`);
    },
}));

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
