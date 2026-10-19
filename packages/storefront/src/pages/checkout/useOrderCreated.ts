import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatDate } from '../../i18n/format';
import { shopApi } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { describeLoadError, type LoadErrorText } from '../../api/describeLoadError';
import {
    describeOrderCreated,
    paymentMethodLabel,
    type OrderCreatedText,
} from '../../utils/orderCreatedText';
import { proformaDocumentUrl } from '../../utils/checkoutPolicy';
import { OrderCreatedDocument, type OrderCreatedQuery } from '../../api/generated/graphql';

type CreatedOrder = NonNullable<OrderCreatedQuery['orderByCode']>;
type ProformaLink = OrderCreatedQuery['myProformaInvoices']['items'][number] & { href: string };

export interface UseOrderCreated {
    loading: Ref<boolean>;
    error: Ref<LoadErrorText | null>;
    order: ComputedRef<CreatedOrder | null>;
    text: ComputedRef<OrderCreatedText>;
    awaitingManager: ComputedRef<boolean>;
    limitExceeded: ComputedRef<boolean>;
    proformaInvoices: ComputedRef<ProformaLink[]>;
    placedAt: ComputedRef<string | null>;
    tradingPoint: ComputedRef<string | null>;
    paymentLabel: ComputedRef<string>;
    delivery: ComputedRef<string | null>;
    load: () => Promise<void>;
}

export function useOrderCreated(): UseOrderCreated {
    const route = useRoute();
    const authStore = useAuthStore();
    const router = useRouter();
    const code = computed(() => (typeof route.query.code === 'string' ? route.query.code : ''));

    const data = ref<OrderCreatedQuery | null>(null);
    const loading = ref(true);
    const error = ref<LoadErrorText | null>(null);

    const order = computed(() => data.value?.orderByCode ?? null);
    const payment = computed(() => order.value?.payments?.[0] ?? null);
    const methodCode = computed(() => payment.value?.method ?? '');

    const paymentLabel = computed(() => paymentMethodLabel(methodCode.value));
    const text = computed(() => describeOrderCreated(code.value, methodCode.value));

    const publicFlags = computed(
        () =>
            (
                payment.value?.metadata as {
                    public?: {
                        creditLimitExceeded?: boolean;
                        awaitingManagerConfirmation?: boolean;
                    };
                } | null
            )?.public ?? {},
    );
    const awaitingManager = computed(() => publicFlags.value.awaitingManagerConfirmation === true);
    const limitExceeded = computed(() => publicFlags.value.creditLimitExceeded === true);

    const tradingPoint = computed(() => {
        const id = order.value?.customFields?.tradingPointId;
        if (!id) return null;
        const point =
            data.value?.myTradingPoints?.find(p => p.id === id) ??
            (authStore.tradingPoint?.id === id ? authStore.tradingPoint : null);
        return point ? (point.address ?? point.name) : null;
    });

    const delivery = computed(() => order.value?.shippingLines?.[0]?.shippingMethod.name ?? null);
    const placedAt = computed(() =>
        order.value?.orderPlacedAt
            ? formatDate(order.value.orderPlacedAt, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : null,
    );
    function proformaInvoiceHref(id: string): string {
        return router.resolve({ path: `/proforma-invoices/${id}`, query: { print: '1' } }).href;
    }
    const proformaInvoices = computed(() =>
        (data.value?.myProformaInvoices.items ?? [])
            .filter(i => i.status !== 'superseded')
            .map(i => ({ ...i, href: proformaDocumentUrl(i) ?? proformaInvoiceHref(i.id) })),
    );

    async function load(): Promise<void> {
        if (!code.value) {
            await router.replace('/orders');
            return;
        }
        loading.value = true;
        error.value = null;
        try {
            data.value = await shopApi(OrderCreatedDocument, { code: code.value });
        } catch (e) {
            error.value = describeLoadError(e);
        } finally {
            loading.value = false;
        }
    }

    onMounted(load);

    return {
        loading,
        error,
        order,
        text,
        awaitingManager,
        limitExceeded,
        proformaInvoices,
        placedAt,
        tradingPoint,
        paymentLabel,
        delivery,
        load,
    };
}
