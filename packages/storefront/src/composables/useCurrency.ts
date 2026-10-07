import { ref } from 'vue';
import { shopApi } from '../api/client';
import { DefaultCurrencyDocument } from '../api/generated/graphql';

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

function formatWholeMoney(amount: number, code: string | null): string {
    const options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
    if (code) Object.assign(options, { style: 'currency', currency: code });
    return new Intl.NumberFormat('ru-RU', options).format(amount);
}

export function useCurrency(): { formatWhole: (amount: number) => string } {
    ensureLoaded();
    return { formatWhole: amount => formatWholeMoney(amount, currencyCode.value) };
}
