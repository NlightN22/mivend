import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    ERP_DISCOUNTS_VIEWS,
    ERP_DISCOUNT_STATUS_VARIANT,
    type ErpDiscountItem,
    type ErpDiscountsView,
} from '../../api/erpDiscountsList';

export interface ErpCustomerCell {
    label: string;
    // Set only when exactly one named customer is visible and it is imported.
    href: string | null;
    suffix: string;
    title: string | null;
}

export interface ErpDiscountRow {
    id: string;
    number: string;
    validFrom: string;
    customer: ErpCustomerCell;
    percentLabel: string;
    markup: boolean;
    priceType: string;
    products: string;
    validTo: string | null;
    status: string;
    statusLabel: string;
    statusVariant: StatusBadgeVariant;
    inactiveReason: string | null;
}

const STATUS_LABEL = new Map(ERP_DISCOUNTS_VIEWS.map(v => [v.key as string, v.label]));

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

// The server returns only the recipients inside the caller's scope; recipientCount is the real total.
export function customerCell(item: ErpDiscountItem): ErpCustomerCell {
    const total = item.recipientCount;
    const visible = item.counterparties;
    if (total === 0) return { label: 'All customers', href: null, suffix: '', title: null };
    if (visible.length === 1) {
        const [only] = visible;
        return {
            label: only.name,
            href: only.id ? `/customers/${only.id}` : null,
            suffix: total > 1 ? ` +${total - 1} more` : '',
            title: null,
        };
    }
    const names = visible.map(c => c.name).join(', ');
    const hidden = total - visible.length;
    const hiddenNote = hidden > 0 && names ? ` and ${hidden} more` : '';
    return {
        label: plural(total, 'customer', 'customers'),
        href: null,
        suffix: '',
        title: names ? `${names}${hiddenNote}` : null,
    };
}

// A negative percent is a markup: shown with a plus sign.
export function percentLabel(percent: number): string {
    const value = Number(Math.abs(percent).toFixed(2));
    return percent < 0 ? `+${value}%` : `-${value}%`;
}

export function productsLabel(item: ErpDiscountItem): string {
    if (item.allProducts) return 'All products';
    if (item.productMode === 'filter') return 'By filter';
    return plural(item.productCount, 'product', 'products');
}

export function toErpDiscountRows(items: ErpDiscountItem[]): ErpDiscountRow[] {
    return items.map(item => ({
        id: item.id,
        number: item.documentNumber,
        validFrom: item.validFrom,
        customer: customerCell(item),
        percentLabel: percentLabel(item.percent),
        markup: item.percent < 0,
        priceType: item.priceTypeCode ?? '—',
        products: productsLabel(item),
        validTo: item.validTo ?? null,
        status: item.status,
        statusLabel: STATUS_LABEL.get(item.status) ?? item.status,
        statusVariant:
            ERP_DISCOUNT_STATUS_VARIANT[item.status as Exclude<ErpDiscountsView, 'all'>] ??
            'neutral',
        inactiveReason: item.status === 'inactive' ? item.inactiveReason : null,
    }));
}
