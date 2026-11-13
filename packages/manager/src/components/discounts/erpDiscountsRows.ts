import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    ERP_DISCOUNTS_VIEWS,
    ERP_DISCOUNT_STATUS_VARIANT,
    type ErpDiscountItem,
    type ErpDiscountsView,
} from '../../api/erpDiscountsList';
import { tr } from '../../utils/lazyLabels';

export interface ErpCustomerCell {
    label: string;
    // Set only when exactly one named customer is visible and it is imported.
    href: string | null;
    suffix: string;
    title: string | null;
}

export type ErpDiscountRow = {
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
};

// The server returns only the recipients inside the caller's scope; recipientCount is the real total.
export function customerCell(item: ErpDiscountItem): ErpCustomerCell {
    const total = item.recipientCount;
    const visible = item.counterparties;
    if (total === 0 && item.status === 'inactive') {
        return {
            label: '—',
            href: null,
            suffix: '',
            title: tr('discounts.erp.rows.recipientsNotKept'),
        };
    }
    if (total === 0)
        return { label: tr('discounts.rows.allCustomers'), href: null, suffix: '', title: null };
    if (visible.length === 1) {
        const [only] = visible;
        return {
            label: only.name,
            href: only.id ? `/customers/${only.id}` : null,
            suffix: total > 1 ? tr('discounts.erp.rows.plusMore', { count: total - 1 }) : '',
            title: null,
        };
    }
    const names = visible.map(c => c.name).join(', ');
    const hidden = total - visible.length;
    const title =
        hidden > 0 && names
            ? tr('discounts.erp.rows.namesAndMore', { names, count: hidden })
            : names;
    return {
        label: tr('discounts.erp.rows.customers', { count: total }, total),
        href: null,
        suffix: '',
        title: title || null,
    };
}

// A negative percent is a markup: shown with a plus sign.
export function percentLabel(percent: number): string {
    const value = Number(Math.abs(percent).toFixed(2));
    return percent < 0 ? `+${value}%` : `-${value}%`;
}

export function productsLabel(item: ErpDiscountItem): string {
    if (item.allProducts) return tr('discounts.rows.allProducts');
    if (item.productMode === 'filter') return tr('discounts.erp.rows.byFilter');
    return tr('discounts.erp.rows.products', { count: item.productCount }, item.productCount);
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
        statusLabel: ERP_DISCOUNTS_VIEWS.find(v => v.key === item.status)?.label ?? item.status,
        statusVariant:
            ERP_DISCOUNT_STATUS_VARIANT[item.status as Exclude<ErpDiscountsView, 'all'>] ??
            'neutral',
        inactiveReason: item.status === 'inactive' ? item.inactiveReason : null,
    }));
}
