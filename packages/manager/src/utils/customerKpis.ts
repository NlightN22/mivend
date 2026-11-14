import { i18n } from '../i18n';
import type { CustomerCredit, CustomerOrderItem } from '../api/customers';
import type { OutstandingBalance } from '../api/proforma-invoices';

export interface CustomerKpi {
    key: string;
    label: string;
    kind: 'minor' | 'whole' | 'count';
    value: number;
}

const label = (key: string): string => i18n.global.t(`customers.kpis.${key}`);

const DAY_MS = 24 * 60 * 60 * 1000;
// Mirrors the customer card: terminal states need no attention.
const CLOSED_ORDER_STATES = new Set(['Delivered', 'Cancelled']);

export function customerKpis(
    orders: Pick<CustomerOrderItem, 'state' | 'orderPlacedAt' | 'totalWithTax'>[],
    credit: CustomerCredit | null,
    outstanding: OutstandingBalance | null,
    now = Date.now(),
): CustomerKpi[] {
    const since = now - 30 * DAY_MS;
    const kpis: CustomerKpi[] = [
        {
            key: 'sales30d',
            label: label('sales30d'),
            kind: 'minor',
            value: orders
                .filter(o => o.orderPlacedAt && new Date(o.orderPlacedAt).getTime() >= since)
                .reduce((sum, o) => sum + o.totalWithTax, 0),
        },
        {
            key: 'openOrders',
            label: label('openOrders'),
            kind: 'count',
            value: orders.filter(o => !CLOSED_ORDER_STATES.has(o.state)).length,
        },
        {
            key: 'outstanding',
            label: label('outstanding'),
            kind: 'minor',
            value: outstanding?.amount ?? 0,
        },
    ];
    if (credit) {
        kpis.push(
            {
                key: 'availableCredit',
                label: label('availableCredit'),
                kind: 'whole',
                value: credit.creditLimit - credit.creditBalance,
            },
            {
                key: 'creditLimit',
                label: label('creditLimit'),
                kind: 'whole',
                value: credit.creditLimit,
            },
        );
    }
    return kpis;
}
