import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { DISCOUNT_STATUS_BADGE_VARIANT } from '../api/discounts';
import { ORDER_STATE_BADGE_VARIANT, ORDER_STATE_LABEL } from '../api/orders';
import { PROFORMA_INVOICE_STATUS_BADGE_VARIANT } from '../api/proforma-invoices';
import { i18n } from '../i18n';
import { humanize } from './searchTarget';

function statusLabel(status: string): string {
    const key = `shell.search.status.${status}`;
    return i18n.global.te(key) ? i18n.global.t(key) : humanize(status);
}

export interface SearchStatusBadge {
    label: string;
    variant: StatusBadgeVariant;
}

// Same maps as each kind's list. A settlement hit carries only the type category, and a materialized
// discount has no date-derived status in a search hit, so both stay neutral.
export function searchStatusBadge(kind: string, status: string): SearchStatusBadge {
    switch (kind) {
        case 'order':
            return {
                label: ORDER_STATE_LABEL[status] ?? humanize(status),
                variant: ORDER_STATE_BADGE_VARIANT[status] ?? 'neutral',
            };
        case 'proformaInvoice':
            return {
                label: statusLabel(status),
                variant: PROFORMA_INVOICE_STATUS_BADGE_VARIANT[status] ?? 'neutral',
            };
        case 'counterparty':
            return {
                label: statusLabel(status),
                variant: status === 'active' ? 'success' : 'neutral',
            };
        case 'discount':
            return {
                label: statusLabel(status),
                variant:
                    status === 'pending' || status === 'rejected'
                        ? DISCOUNT_STATUS_BADGE_VARIANT[status]
                        : 'neutral',
            };
        default:
            return { label: statusLabel(status), variant: 'neutral' };
    }
}
