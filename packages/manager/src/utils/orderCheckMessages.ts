import type { StatusBadgeVariant } from '@mivend/ui-kit';

export interface OrgRef {
    id: string;
    name: string | null;
}

export interface OrgBreakdown extends OrgRef {
    stock: number;
    hasContract: boolean;
}

export interface OrderCheckFacts {
    reason?: string;
    productErpId?: string;
    sku?: string;
    warehouseErpId?: string;
    organization?: OrgRef;
    storageOrganizations?: OrgBreakdown[];
    needed?: number;
    available?: number;
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
        'No contract with the organization that sells this line',
    'erp.organization-stock.short':
        'The organization that sells this line has less stock than needed',
};

export function findingTitle(messageKey: string): string {
    return TITLES[messageKey] ?? messageKey;
}

export function severityVariant(severity: string): StatusBadgeVariant {
    if (severity === 'error') return 'danger';
    if (severity === 'warning') return 'warning';
    return 'info';
}

export function findingsByLine(findings: OrderCheckFinding[]): Map<string, OrderCheckFinding[]> {
    const byLine = new Map<string, OrderCheckFinding[]>();
    for (const f of findings) {
        const key = f.lineRef ?? '';
        byLine.set(key, [...(byLine.get(key) ?? []), f]);
    }
    return byLine;
}
