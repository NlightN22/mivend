import type { StatusBadgeVariant } from '@mivend/ui-kit';

export interface OrgRef {
    id: string;
    name: string;
}

export interface OrderCheckFacts {
    reason?: string;
    productErpId?: string;
    sku?: string;
    warehouseErpId?: string;
    storageOrganizations?: OrgRef[];
    contractOrganizations?: OrgRef[];
    eligibleOrganizations?: OrgRef[];
    needed?: number;
    available?: number;
    storageStock?: number;
}

export interface OrderCheckFinding {
    id: string;
    checkCode: string;
    stage: string | null;
    lineRef: string | null;
    severity: string;
    messageKey: string;
    facts: OrderCheckFacts;
    computedAt: string;
    stale: boolean;
}

const TITLES: Record<string, string> = {
    'erp.contract-with-storage-organization.missing':
        'No contract with an organization that holds the storage place',
    'erp.organization-stock.storage-organizations-short':
        'The organizations holding the storage place have less stock than needed',
    'erp.organization-stock.contract-organizations-short':
        'Stock is enough, but not at the organizations the buyer has a contract with',
};

export function findingTitle(messageKey: string): string {
    return TITLES[messageKey] ?? messageKey;
}

export function severityVariant(severity: string): StatusBadgeVariant {
    if (severity === 'error') return 'danger';
    if (severity === 'warning') return 'warning';
    return 'info';
}

export function orgNames(orgs: OrgRef[] | undefined): string {
    return orgs?.length ? orgs.map(o => o.name).join(', ') : '—';
}

export function findingsByLine(findings: OrderCheckFinding[]): Map<string, OrderCheckFinding[]> {
    const byLine = new Map<string, OrderCheckFinding[]>();
    for (const f of findings) {
        const key = f.lineRef ?? '';
        byLine.set(key, [...(byLine.get(key) ?? []), f]);
    }
    return byLine;
}
