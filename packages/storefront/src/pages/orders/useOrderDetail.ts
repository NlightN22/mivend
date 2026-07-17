import { ref } from 'vue';
import { shopApi } from '../../api/client';
import { OrderDetailDocument, type OrderDetailQuery } from '../../api/generated/graphql';

export type OrderDetail = NonNullable<OrderDetailQuery['order']>;

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
            const result = await shopApi(OrderDetailDocument, { id });
            order.value = result.order ?? null;
        } catch (e) {
            console.error('[useOrderDetail]', e);
        } finally {
            loading.value = false;
        }
    }

    return { order, loading, load };
}
