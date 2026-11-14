import { i18n } from '../../i18n';
import { formatDateTime } from '../../i18n/format';

const t = (key: string, named?: Record<string, unknown>): string => i18n.global.t(key, named ?? {});

// "new" when the earlier window had no turnover; null when neither window has any.
export function dynamicsText(current: number, previous: number): string | null {
    if (previous === 0) return current === 0 ? null : t('customers.metrics.dynamicsNew');
    const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
    return t('customers.metrics.dynamics', { percent: `${percent > 0 ? '+' : ''}${percent}%` });
}

export function balanceCaption(balanceMinor: number): string {
    if (balanceMinor > 0) return t('customers.metrics.owesUs');
    if (balanceMinor < 0) return t('customers.metrics.weOwe');
    return t('customers.metrics.settled');
}

export function contractLabel(row: { contractName: string | null; contractErpId: string }): string {
    return row.contractName ?? (row.contractErpId || t('customers.metrics.noContract'));
}

export const formatComputedAt = (iso: string): string => formatDateTime(iso);
