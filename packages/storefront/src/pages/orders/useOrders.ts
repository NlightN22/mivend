import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';

export type ErpStatus =
    | 'PENDING'
    | 'SENT_TO_ERP'
    | 'RESERVED'
    | 'CONFIRMED'
    | 'ASSEMBLED'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED';

export interface OrderLine {
    id: string;
    quantity: number;
    linePriceWithTax: number;
    productVariant: {
        id: string;
        sku: string;
        name: string;
        product: { name: string; slug: string };
    };
}

export interface OrderSummary {
    id: string;
    code: string;
    state: string;
    createdAt: string;
    totalWithTax: number;
    currencyCode: string;
    lines: OrderLine[];
    shippingAddress: {
        fullName?: string;
        streetLine1?: string;
        city?: string;
    } | null;
    customFields: {
        erpStatus: ErpStatus | null;
        erpOrderId: string | null;
        erpStatusAt: string | null;
    };
}

export interface MyOrdersOptions {
    take: number;
    skip: number;
    search?: string;
    erpStatuses?: ErpStatus[];
}

const MY_ORDERS_QUERY = `
    query MyOrders($options: MyOrdersListOptions) {
        myOrders(options: $options) {
            items {
                id code state createdAt totalWithTax currencyCode
                lines {
                    id quantity linePriceWithTax
                    productVariant {
                        id sku name
                        product { name slug }
                    }
                }
                shippingAddress { fullName streetLine1 city }
                customFields { erpStatus erpOrderId erpStatusAt }
            }
            totalItems
        }
    }
`;

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
            const result = await shopApi<{
                myOrders: { items: OrderSummary[]; totalItems: number };
            }>(MY_ORDERS_QUERY, { options });
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
