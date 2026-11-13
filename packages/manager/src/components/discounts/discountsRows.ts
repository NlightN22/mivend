import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    DISCOUNT_STATUS_BADGE_VARIANT,
    DISCOUNT_STATUS_OPTIONS,
    type DiscountStatus,
} from '../../api/discounts';
import type { DiscountRegistryItem } from '../../api/discountsList';
import { tr } from '../../utils/lazyLabels';

export type DiscountRow = {
    id: string;
    number: string;
    createdAt: string;
    customer: string;
    scope: string;
    shared: boolean;
    priceType: string;
    productGroup: string;
    percent: number;
    validFrom: string;
    validTo: string;
    status: DiscountStatus;
    statusLabel: string;
    statusVariant: StatusBadgeVariant;
    justification: string | null;
    approvalRequestId: string | null;
    // Null for ERP-pushed rules, which a person cannot renew from the portal.
    ruleErpId: string | null;
};

// Display-only copy of the server's threshold (EXPIRING_SOON_DAYS); the server alone filters by it.
const EXPIRING_SOON_DAYS = 14;

function displayStatus(item: DiscountRegistryItem, now: number): DiscountStatus {
    if (item.status === 'pending' || item.status === 'rejected') return item.status;
    const validTo = new Date(item.validTo).getTime();
    if (validTo < now) return 'expired';
    return validTo - now < EXPIRING_SOON_DAYS * 86_400_000 ? 'expiring-soon' : 'active';
}

function customerLabel(ids: string[] | null, namesById: Map<string, string>): string {
    if (!ids || ids.length === 0) return tr('discounts.rows.allCustomers');
    return ids.map(id => namesById.get(id) ?? id).join(', ');
}

// Personal means exactly one customer; any other set (or company-wide) reaches other customers too.
function scopeLabel(ids: string[] | null): string {
    if (!ids || ids.length === 0) return tr('discounts.rows.allCustomers');
    return ids.length === 1
        ? tr('discounts.rows.personal')
        : tr('discounts.rows.sharedWithMore', { count: ids.length - 1 });
}

// A portal rule's erpId is portal-<approval request id> (DiscountGrantService.decideAndApply).
export function toDiscountRows(
    items: DiscountRegistryItem[],
    namesById: Map<string, string>,
    now: number = Date.now(),
): DiscountRow[] {
    return items.map(item => {
        const status = displayStatus(item, now);
        return {
            id: item.id,
            number: item.number,
            createdAt: item.createdAt,
            customer: customerLabel(item.counterpartyIds, namesById),
            scope: scopeLabel(item.counterpartyIds),
            shared: (item.counterpartyIds?.length ?? 0) !== 1,
            priceType: item.priceTypeCode,
            productGroup: item.facetValueCode ?? tr('discounts.rows.allProducts'),
            percent: item.percent,
            validFrom: item.validFrom,
            validTo: item.validTo,
            status,
            statusLabel: DISCOUNT_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status,
            statusVariant: DISCOUNT_STATUS_BADGE_VARIANT[status],
            justification: item.justification,
            approvalRequestId: item.approvalRequestId,
            ruleErpId:
                item.discountRuleId && item.approvalRequestId
                    ? `portal-${item.approvalRequestId}`
                    : null,
        };
    });
}
