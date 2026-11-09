import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    DISCOUNT_STATUS_BADGE_VARIANT,
    DISCOUNT_STATUS_OPTIONS,
    type DiscountStatus,
} from '../../api/discounts';
import type { DiscountRegistryItem } from '../../api/discountsList';

export type DiscountRow = {
    id: string;
    number: string;
    createdAt: string;
    customer: string;
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

const ALL_CUSTOMERS_LABEL = 'All customers';
const STATUS_LABEL = new Map(DISCOUNT_STATUS_OPTIONS.map(o => [o.value, o.label]));

// Display-only copy of the server's threshold (EXPIRING_SOON_DAYS); the server alone filters by it.
const EXPIRING_SOON_DAYS = 14;

function displayStatus(item: DiscountRegistryItem, now: number): DiscountStatus {
    if (item.status === 'pending' || item.status === 'rejected') return item.status;
    const validTo = new Date(item.validTo).getTime();
    if (validTo < now) return 'expired';
    return validTo - now < EXPIRING_SOON_DAYS * 86_400_000 ? 'expiring-soon' : 'active';
}

function customerLabel(ids: string[] | null, namesById: Map<string, string>): string {
    if (!ids || ids.length === 0) return ALL_CUSTOMERS_LABEL;
    return ids.map(id => namesById.get(id) ?? id).join(', ');
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
            priceType: item.priceTypeCode,
            productGroup: item.facetValueCode ?? 'All products',
            percent: item.percent,
            validFrom: item.validFrom,
            validTo: item.validTo,
            status,
            statusLabel: STATUS_LABEL.get(status) ?? status,
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
