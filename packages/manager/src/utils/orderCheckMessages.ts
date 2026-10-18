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
    quantity?: number;
    requiredMultiple?: number;
    availableCredit?: number;
    orderAmount?: number;
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
    'order.line-without-organization.missing': 'This item has no seller organization',
    'order.contract-unresolved.missing': 'The buyer has no usable contract to register this order',
    'erp.export-data-missing.customer': 'The buyer has no ERP counterparty',
    'erp.export-data-missing.product': 'This product has no ERP id',
    'erp.export-data-missing.warehouse': 'No ERP warehouse is resolved for this order',
    'delivery.freight-trading-point.missing': 'Freight delivery needs an active trading point',
    'order.multiplicity.violated': 'The quantity is not a multiple of the pack size',
    'credit.limit.exceeded': "The order exceeds the buyer's available credit",
    'order.below-floor-price.below-floor': 'The unit price is below the floor price',
};

// The facts that explain a finding in one line, for the list in the header card and under a line.
export function findingDetail(f: OrderCheckFinding): string | null {
    const { facts } = f;
    if (f.messageKey === 'order.multiplicity.violated') {
        return `${facts.sku ?? 'Line'}: ${facts.quantity} is not a multiple of ${facts.requiredMultiple}`;
    }
    if (f.messageKey === 'credit.limit.exceeded') {
        return `Order ${facts.orderAmount}, available credit ${facts.availableCredit}`;
    }
    return facts.sku ? String(facts.sku) : null;
}

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
