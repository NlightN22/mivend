import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { MyOrdersDocument, type MyOrdersQuery } from '../../api/generated/graphql';

export type OrderSummary = MyOrdersQuery['myOrders']['items'][number];

export interface MyOrdersOptions {
    take: number;
    skip: number;
    search?: string;
    erpStatuses?: string[];
    isExternal?: boolean;
}

function orderFilter(options: MyOrdersOptions): Record<string, unknown> | undefined {
    const filter: Record<string, unknown> = {};
    if (options.erpStatuses && options.erpStatuses.length > 0) {
        filter.erpStatus = { in: options.erpStatuses };
    }
    if (options.isExternal !== undefined) filter.isExternal = { eq: options.isExternal };
    return Object.keys(filter).length > 0 ? filter : undefined;
}

export function useOrders(): {
    orders: Ref<OrderSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    load: (options: MyOrdersOptions) => Promise<void>;
} {
    const orders = ref<OrderSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);

    async function load(options: MyOrdersOptions): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(MyOrdersDocument, {
                options: {
                    take: options.take,
                    skip: options.skip,
                    filter: orderFilter(options),
                },
                search: options.search,
            });
            orders.value = result.myOrders.items;
            totalItems.value = result.myOrders.totalItems;
        } catch (e) {
            console.error('[useOrders]', e);
        } finally {
            loading.value = false;
        }
    }

    return { orders, totalItems, loading, load };
}
