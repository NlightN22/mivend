import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { tr } from './lazyLabels';

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

const TITLE_KEYS: Record<string, string> = {
    'erp.contract-with-storage-organization.missing': 'contractMissing',
    'erp.organization-stock.short': 'stockShort',
    'order.line-without-organization.missing': 'lineWithoutOrganization',
    'order.contract-unresolved.missing': 'contractUnresolved',
    'erp.export-data-missing.customer': 'customerExportMissing',
    'erp.export-data-missing.product': 'productExportMissing',
    'erp.export-data-missing.warehouse': 'warehouseExportMissing',
    'delivery.freight-trading-point.missing': 'freightTradingPointMissing',
    'order.multiplicity.violated': 'multiplicityViolated',
    'credit.limit.exceeded': 'creditLimitExceeded',
    'order.below-floor-price.below-floor': 'belowFloor',
    'order.discount-over-limit.over-limit': 'discountOverLimit',
};

// The facts that explain a finding in one line, for the list in the header card and under a line.
export function findingDetail(f: OrderCheckFinding): string | null {
    const { facts } = f;
    if (f.messageKey === 'order.multiplicity.violated') {
        return tr('orderLines.checkDetail.multiplicity', {
            sku: facts.sku ?? tr('orderLines.checkDetail.line'),
            quantity: facts.quantity,
            multiple: facts.requiredMultiple,
        });
    }
    if (f.messageKey === 'credit.limit.exceeded') {
        return tr('orderLines.checkDetail.credit', {
            amount: facts.orderAmount,
            credit: facts.availableCredit,
        });
    }
    return facts.sku ? String(facts.sku) : null;
}

export function findingTitle(messageKey: string): string {
    const key = TITLE_KEYS[messageKey];
    return key ? tr(`orderLines.checkTitles.${key}`) : messageKey;
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
