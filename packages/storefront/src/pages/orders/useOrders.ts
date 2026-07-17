import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { MyOrdersDocument, type MyOrdersQuery } from '../../api/generated/graphql';

export type ErpStatus =
    | 'PENDING'
    | 'SENT_TO_ERP'
    | 'RESERVED'
    | 'CONFIRMED'
    | 'ASSEMBLED'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED';

export type OrderSummary = MyOrdersQuery['myOrders']['items'][number];

export interface MyOrdersOptions {
    take: number;
    skip: number;
    search?: string;
    erpStatuses?: ErpStatus[];
}

export const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Processing',
    SENT_TO_ERP: 'Sent to ERP',
    RESERVED: 'Reserved / Pending approval',
    CONFIRMED: 'Confirmed',
    ASSEMBLED: 'Assembled',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
};

export const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'muted' | 'error'> = {
    PENDING: 'muted',
    SENT_TO_ERP: 'warning',
    RESERVED: 'warning',
    CONFIRMED: 'default',
    ASSEMBLED: 'default',
    SHIPPED: 'default',
    DELIVERED: 'muted',
    CANCELLED: 'error',
};

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
                    filter:
                        options.erpStatuses && options.erpStatuses.length > 0
                            ? { erpStatus: { in: options.erpStatuses } }
                            : undefined,
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
