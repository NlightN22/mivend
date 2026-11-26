import { i18n } from '../../i18n';
import { formatDate } from '../../i18n/format';
import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { PORTAL_STATES, type PortalState } from './customersColumns';
import type { CustomerCredit, CustomerListItem } from '../../api/customers';

export type CustomerRow = {
    id: string;
    shortName: string;
    inn: string;
    manager: string;
    branch: string;
    group: string;
    innStatus: string;
    portalState: string;
    contact: string;
    creditLimit: string;
    creditBalance: string;
    creditUsagePercent: number | null;
    discounts: number;
    lastOrder: string;
    isActive: boolean;
    contractScanMissing: boolean;
};

export interface CustomerRowSources {
    credit: Map<string, CustomerCredit>;
    discountCounts: Map<string, number>;
    managerName: (assignedManagerId: string | null, managerErpId: string | null) => string;
    branchName: (branchId: string | null) => string;
    formatMoney: (value: number) => string;
}

export function toCustomerRows(items: CustomerListItem[], src: CustomerRowSources): CustomerRow[] {
    return items.map(c => {
        const primaryContact = c.contacts.find(p => p.isPrimary) ?? c.contacts[0];
        const credit = src.credit.get(c.id);
        return {
            id: c.id,
            shortName: c.shortName,
            inn: c.inn ?? '',
            manager: src.managerName(c.assignedManagerId, c.managerErpId ?? null),
            branch: src.branchName(c.branchId),
            group: c.erpGroupLabel ?? '',
            innStatus: c.innStatus,
            portalState: c.portalState ?? '',
            contact: primaryContact?.name ?? '—',
            creditLimit: credit ? src.formatMoney(credit.creditLimit) : '—',
            creditBalance: credit ? src.formatMoney(credit.creditBalance) : '—',
            creditUsagePercent:
                credit && credit.creditLimit > 0
                    ? (credit.creditBalance / credit.creditLimit) * 100
                    : null,
            discounts: src.discountCounts.get(c.id) ?? 0,
            lastOrder: c.lastOrderAt ? formatDate(c.lastOrderAt) : '—',
            isActive: c.isActive,
            contractScanMissing: c.hasUnscannedActiveContract ?? false,
        };
    });
}

// Same thresholds as the "Credit balance used" KPI caption on the customers page.
export function usageVariant(percent: number): 'danger' | 'warn' | 'normal' {
    if (percent >= 90) return 'danger';
    if (percent >= 70) return 'warn';
    return 'normal';
}

const INN_STATUS_VARIANT = {
    ok: 'neutral',
    missing: 'warning',
    duplicate: 'danger',
} as const;

const PORTAL_STATE_VARIANT: Record<PortalState, StatusBadgeVariant> = {
    none: 'neutral',
    invited: 'info',
    verified: 'warning',
    active: 'success',
};

export function portalStateBadge(
    state: string,
): { variant: StatusBadgeVariant; label: string } | null {
    if (!(PORTAL_STATES as readonly string[]).includes(state)) return null;
    return {
        variant: PORTAL_STATE_VARIANT[state as PortalState],
        label: i18n.global.t(`customers.list.portalState.${state}`),
    };
}

export function innStatusBadge(status: string): { variant: StatusBadgeVariant; label: string } {
    const key = status in INN_STATUS_VARIANT ? (status as keyof typeof INN_STATUS_VARIANT) : 'ok';
    return {
        variant: INN_STATUS_VARIANT[key],
        label: i18n.global.t(`customers.list.innStatus.${key}`),
    };
}
