import { ref, type Ref } from 'vue';
import { adminApi } from '../api/client';
import { DefaultCurrencyDocument } from '../api/generated/graphql';

const currencyCode = ref<string | null>(null);
let loading: Promise<void> | null = null;

function ensureLoaded(): void {
    if (currencyCode.value || loading) return;
    loading = adminApi(DefaultCurrencyDocument)
        .then(data => {
            currencyCode.value = data.activeChannel.defaultCurrencyCode;
        })
        .catch(() => undefined)
        .finally(() => {
            loading = null;
        });
}

function format(amount: number, code: string | null, fractionDigits = 0): string {
    const options: Intl.NumberFormatOptions = {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    };
    if (code) Object.assign(options, { style: 'currency', currency: code });
    return new Intl.NumberFormat('ru-RU', options).format(amount);
}

export function useCurrency(): {
    formatWhole: (amount: number) => string;
    formatMinor: (amount: number) => string;
    formatMinorExact: (amount: number) => string;
    currencyCode: Ref<string | null>;
} {
    ensureLoaded();
    return {
        formatWhole: amount => format(amount, currencyCode.value),
        formatMinor: amount => format(amount / 100, currencyCode.value),
        formatMinorExact: amount => format(amount / 100, currencyCode.value, 2),
        currencyCode,
    };
}
