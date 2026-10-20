import { formatMoney } from '../../i18n/format';
import type { MoneyByCurrency } from './balanceView';

export function formatMinor(minor: number, currency: string): string {
    return formatMoney(minor / 100, currency);
}

export function formatTotals(totals: readonly MoneyByCurrency[]): string {
    if (!totals.length) return formatMoney(0);
    return totals.map(t => formatMinor(t.minor, t.currency)).join(' + ');
}
