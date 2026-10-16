import { findingTitle, type OrderCheckFinding, type OrgBreakdown } from './orderCheckMessages';
import type { OrderReservation } from '../api/reservation';

export interface OrgRow {
    id: string;
    name: string;
    stock: number;
    hasContract: boolean;
    selling: boolean;
}

export interface LineCheckView {
    needed: number;
    available: number | null;
    stockShort: boolean;
    stockTitle: string | null;
    contractOk: boolean;
    allowed: number;
    contractTitle: string | null;
    orgRows: OrgRow[];
}

const CONTRACT_CODE = 'erp.contract-with-storage-organization';
const STOCK_CODE = 'erp.organization-stock';
const CONTRACT_UNRESOLVED_CODE = 'order.contract-unresolved';
// Line findings of these checks are drawn in the Stock and Contract columns; every other finding is listed as text.
const COLUMN_CODES = new Set([CONTRACT_CODE, STOCK_CODE]);

export function listedFindings(findings: OrderCheckFinding[]): OrderCheckFinding[] {
    return findings.filter(f => !(COLUMN_CODES.has(f.checkCode) && f.lineRef));
}

export function orgRows(
    storage: OrgBreakdown[] | undefined,
    sellingId: string | undefined,
): OrgRow[] {
    return (storage ?? []).map(o => ({
        id: o.id,
        name: o.name ?? o.id,
        stock: o.stock,
        hasContract: o.hasContract,
        selling: o.id === sellingId,
    }));
}

export function lineCheckView(
    quantity: number,
    warehouseAvailable: number | undefined,
    findings: OrderCheckFinding[],
): LineCheckView {
    const contract = findings.find(f => f.checkCode === CONTRACT_CODE);
    const stock = findings.find(f => f.checkCode === STOCK_CODE);
    const source = stock ?? contract;
    const needed = stock?.facts.needed ?? quantity;
    const contractOk = !contract;
    const organization = source?.facts.organization;
    return {
        needed,
        available: stock ? (stock.facts.available ?? 0) : (warehouseAvailable ?? null),
        stockShort: !!stock || (warehouseAvailable !== undefined && warehouseAvailable < quantity),
        stockTitle: stock ? findingTitle(stock.messageKey) : null,
        contractOk,
        allowed: contractOk ? needed : 0,
        contractTitle: contract ? findingTitle(contract.messageKey) : null,
        orgRows: orgRows(source?.facts.storageOrganizations, organization?.id),
    };
}

export function lineReservedQuantity(reservations: OrderReservation[], lineId: string): number {
    return reservations
        .filter(r => r.status === 'active' && r.orderLineId === lineId)
        .reduce((total, r) => total + r.quantity, 0);
}

export function checksSummary(findings: OrderCheckFinding[]): {
    lineCount: number;
    hasContractIssue: boolean;
    listed: OrderCheckFinding[];
} {
    const columnLines = new Set(
        findings.filter(f => COLUMN_CODES.has(f.checkCode) && f.lineRef).map(f => f.lineRef),
    );
    return {
        lineCount: columnLines.size,
        hasContractIssue: findings.some(
            f => f.checkCode === CONTRACT_CODE || f.checkCode === CONTRACT_UNRESOLVED_CODE,
        ),
        listed: listedFindings(findings),
    };
}
