import { ref } from 'vue';
import { shopApi } from '../../api/client';
import type { ErpStatus } from './useOrders';

export interface OrderDetailLine {
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    productVariant: {
        id: string;
        sku: string;
        name: string;
        product: { name: string; slug: string };
    };
}

export interface OrderDetail {
    id: string;
    code: string;
    state: string;
    createdAt: string;
    totalWithTax: number;
    subTotalWithTax: number;
    shippingWithTax: number;
    currencyCode: string;
    lines: OrderDetailLine[];
    shippingAddress: {
        fullName?: string;
        streetLine1?: string;
        streetLine2?: string;
        city?: string;
        postalCode?: string;
        country?: string;
    } | null;
    customFields: {
        erpStatus: ErpStatus | null;
        erpOrderId: string | null;
        erpStatusAt: string | null;
    };
}

const ORDER_DETAIL_QUERY = `
    query OrderDetail($id: ID!) {
        order(id: $id) {
            id code state createdAt totalWithTax subTotalWithTax shippingWithTax currencyCode
            lines {
                id quantity unitPriceWithTax linePriceWithTax
                productVariant {
                    id sku name
                    product { name slug }
                }
            }
            shippingAddress { fullName streetLine1 streetLine2 city postalCode country }
            customFields { erpStatus erpOrderId erpStatusAt }
        }
    }
`;

export function useOrderDetail(): {
    order: ReturnType<typeof ref<OrderDetail | null>>;
    loading: ReturnType<typeof ref<boolean>>;
    load: (id: string) => Promise<void>;
} {
    const order = ref<OrderDetail | null>(null);
    const loading = ref(false);

    async function load(id: string): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi<{ order: OrderDetail | null }>(ORDER_DETAIL_QUERY, { id });
            order.value = result.order;
        } catch (e) {
            console.error('[useOrderDetail]', e);
        } finally {
            loading.value = false;
        }
    }

    return { order, loading, load };
}
