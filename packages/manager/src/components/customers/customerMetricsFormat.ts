import { formatDateTime } from '../../i18n/format';
// "new" when the earlier window had no turnover; null when neither window has any.
export function dynamicsText(current: number, previous: number): string | null {
    if (previous === 0) return current === 0 ? null : 'new';
    const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
    return `${percent > 0 ? '+' : ''}${percent}% vs previous 30 days`;
}

export function balanceCaption(balanceMinor: number): string {
    if (balanceMinor > 0) return 'Customer owes us';
    if (balanceMinor < 0) return 'We owe the customer';
    return 'Settled';
}

export function contractLabel(row: {
    contractName: string | null;
    contractErpId: string;
}): string {
    return row.contractName ?? (row.contractErpId || 'No contract');
}

export const formatComputedAt = (iso: string): string =>
    formatDateTime(iso);
