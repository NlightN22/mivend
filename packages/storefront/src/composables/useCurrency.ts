import { ref } from 'vue';
import { shopApi } from '../api/client';
import { DefaultCurrencyDocument } from '../api/generated/graphql';
import { formatMoney } from '../i18n/format';

const currencyCode = ref<string | null>(null);
let loading: Promise<void> | null = null;

function ensureLoaded(): void {
    if (currencyCode.value || loading) return;
    loading = shopApi(DefaultCurrencyDocument)
        .then(data => {
            currencyCode.value = data.activeChannel.defaultCurrencyCode;
        })
        .catch(() => undefined)
        .finally(() => {
            loading = null;
        });
}

export function useCurrency(): { formatCurrencyAmount: (amount: number) => string } {
    ensureLoaded();
    return { formatCurrencyAmount: amount => formatMoney(amount, currencyCode.value) };
}
