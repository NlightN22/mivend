import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { MyPaymentsDocument, type MyPaymentsQuery } from '../../api/generated/graphql';

export type PaymentSummary = MyPaymentsQuery['myPayments']['items'][number];

export interface MyPaymentsOptions {
    take: number;
    skip: number;
    status?: string;
    channel?: string;
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    authorized: 'Authorized',
    captured: 'Succeeded',
    failed: 'Failed',
    canceled: 'Cancelled',
    partiallyRefunded: 'Partially refunded',
    refunded: 'Refunded',
    disputed: 'Disputed',
    chargeback: 'Chargeback',
};

export const PAYMENT_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> =
    {
        pending: 'warning',
        authorized: 'warning',
        captured: 'success',
        failed: 'danger',
        canceled: 'neutral',
        partiallyRefunded: 'neutral',
        refunded: 'neutral',
        disputed: 'danger',
        chargeback: 'danger',
    };

export const PAYMENT_CHANNEL_LABEL: Record<string, string> = {
    'online-acquiring': 'Online acquiring',
    'branch-kassa': 'Branch cash desk',
    'bank-transfer-erp': 'Bank transfer (ERP)',
};

export function usePayments(): {
    payments: Ref<PaymentSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    load: (options: MyPaymentsOptions) => Promise<void>;
} {
    const payments = ref<PaymentSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);

    async function load(options: MyPaymentsOptions): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(MyPaymentsDocument, {
                options: {
                    take: options.take,
                    skip: options.skip,
                    status: options.status,
                    channel: options.channel,
                },
            });
            payments.value = result.myPayments.items;
            totalItems.value = result.myPayments.totalItems;
        } catch (e) {
            console.error('[usePayments]', e);
        } finally {
            loading.value = false;
        }
    }

    return { payments, totalItems, loading, load };
}
