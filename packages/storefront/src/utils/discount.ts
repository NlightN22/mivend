import { i18n } from '../i18n';
import { formatMoney, formatNumber } from '../i18n/format';

// tierProgress.current/nextThreshold are kg for a WEIGHT metric, kopecks for AMOUNT —
// same formatting convention used in the catalog tier tooltip and the cart progress bar.
export function formatTierValue(value: number, metric: 'WEIGHT' | 'AMOUNT'): string {
    return metric === 'WEIGHT'
        ? i18n.global.t('units.kg', { value: formatNumber(value) })
        : formatMoney(value / 100, 'RUB', { maximumFractionDigits: 2 });
}
