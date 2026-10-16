import { findingTitle, type OrderCheckFinding, type OrgRef } from './orderCheckMessages';

export interface OrgContractRow {
    id: string;
    name: string;
    hasContract: boolean;
}

export interface LineCheckView {
    needed: number;
    warehouseAvailable: number | null;
    stockShort: boolean;
    stockTitle: string | null;
    storageStock: number | null;
    eligibleStock: number | null;
    eligibleNames: string[];
    contractOk: boolean;
    allowed: number;
    contractTitle: string | null;
    orgRows: OrgContractRow[];
    stale: boolean;
}

const CONTRACT_CODE = 'erp.contract-with-storage-organization';
const STOCK_CODE = 'erp.organization-stock';

export function orgContractRows(
    storage: OrgRef[] | undefined,
    contract: OrgRef[] | undefined,
): OrgContractRow[] {
    const withContract = new Set((contract ?? []).map(o => o.id));
    return (storage ?? []).map(o => ({
        id: o.id,
        name: o.name,
        hasContract: withContract.has(o.id),
    }));
}

export function lineCheckView(
    quantity: number,
    warehouseAvailable: number | undefined,
    findings: OrderCheckFinding[],
): LineCheckView {
    const contract = findings.find(f => f.checkCode === CONTRACT_CODE);
    const stock = findings.find(f => f.checkCode === STOCK_CODE);
    const source = contract ?? stock;
    const needed = stock?.facts.needed ?? contract?.facts.needed ?? quantity;
    const contractOk = !contract;
    return {
        needed,
        warehouseAvailable: warehouseAvailable ?? null,
        stockShort: !!stock || (warehouseAvailable !== undefined && warehouseAvailable < quantity),
        stockTitle: stock ? findingTitle(stock.messageKey) : null,
        storageStock: stock?.facts.storageStock ?? null,
        eligibleStock: stock ? (stock.facts.available ?? 0) : null,
        eligibleNames: (stock?.facts.eligibleOrganizations ?? []).map(o => o.name),
        contractOk,
        allowed: contractOk ? needed : 0,
        contractTitle: contract ? findingTitle(contract.messageKey) : null,
        orgRows: orgContractRows(
            source?.facts.storageOrganizations,
            source?.facts.contractOrganizations,
        ),
        stale: findings.some(f => f.stale),
    };
}

export function checksSummary(findings: OrderCheckFinding[]): {
    lineCount: number;
    hasContractIssue: boolean;
    orderLevel: OrderCheckFinding[];
} {
    const lines = new Set(findings.filter(f => f.lineRef).map(f => f.lineRef));
    return {
        lineCount: lines.size,
        hasContractIssue: findings.some(f => f.checkCode === CONTRACT_CODE),
        orderLevel: findings.filter(f => !f.lineRef),
    };
}
