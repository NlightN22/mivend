import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { DISCOUNT_STATUS_BADGE_VARIANT } from '../api/discounts';
import { ORDER_STATE_BADGE_VARIANT, ORDER_STATE_LABEL } from '../api/orders';
import { PROFORMA_INVOICE_STATUS_BADGE_VARIANT } from '../api/proforma-invoices';
import { humanize } from './searchTarget';

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
                label: humanize(status),
                variant: PROFORMA_INVOICE_STATUS_BADGE_VARIANT[status] ?? 'neutral',
            };
        case 'counterparty':
            return {
                label: humanize(status),
                variant: status === 'active' ? 'success' : 'neutral',
            };
        case 'discount':
            return {
                label: humanize(status),
                variant:
                    status === 'pending' || status === 'rejected'
                        ? DISCOUNT_STATUS_BADGE_VARIANT[status]
                        : 'neutral',
            };
        default:
            return { label: humanize(status), variant: 'neutral' };
    }
}
