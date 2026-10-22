import { adminApi } from './client';
import {
    ApprovalCounterpartiesDocument,
    ApprovalDetailDocument,
    ApprovalOrderReferencesDocument,
    ApprovalsInboxDocument,
    DecideCreditTermRequestDocument,
    DecideDiscountGrantRequestDocument,
    DecidePriceAdjustmentRequestDocument,
    EscalateApprovalRequestDocument,
    PendingApprovalsBadgeCountDocument,
    type ApprovalRequestPageFieldsFragment,
    type ApprovalRequestSummaryFieldsFragment,
    type ApprovalStepFieldsFragment,
} from './generated/graphql';

export type ApprovalStepAudit = ApprovalStepFieldsFragment;
export type ApprovalRequestSummary = ApprovalRequestSummaryFieldsFragment;
export type ApprovalRequestDetail = ApprovalRequestSummary & { escalatesTo: string[] };
export type ApprovalRequestPage = ApprovalRequestPageFieldsFragment;

export interface ApprovalsInbox {
    awaitingMyDecision: ApprovalRequestPage;
    allInvolved: ApprovalRequestPage;
}

// requestType is set by the workflow engine, not ERP data — this table is the documented carve-out
// creditTermApproval and escalated variant share one mutation; see CreditTermService.decideAndApply
export const REQUEST_TYPE_LABEL: Record<string, string> = {
    priceAdjustmentApproval: 'Price adjustment',
    discountGrantApproval: 'Discount grant',
    creditTermApproval: 'Payment term extension',
    creditTermApprovalEscalated: 'Payment term extension (escalated)',
};

// Decide mutations must be distinct, statically-named operations: codegen rejects dynamic names
// so dispatch by generated Document, not by a mutation-name string
const DECIDE_DOCUMENT_BY_REQUEST_TYPE = {
    priceAdjustmentApproval: DecidePriceAdjustmentRequestDocument,
    discountGrantApproval: DecideDiscountGrantRequestDocument,
    creditTermApproval: DecideCreditTermRequestDocument,
    creditTermApprovalEscalated: DecideCreditTermRequestDocument,
} as const;

// Mirrors backend ApprovalListOptions; eligibility, pagination and filtering all run server-side
// Client-side fetch-all-then-filter was rejected (see approval-request.service.ts)
export interface ApprovalListOptions {
    take?: number;
    skip?: number;
    search?: string;
    requestType?: string;
    status?: string;
}

// One request returns both tabs so the "Awaiting my decision" badge stays accurate on either tab
// Pass { take: 0 } for the inactive tab to fetch only its totalItems, not a page of unseen rows
export async function fetchApprovalsInbox(
    awaitingOptions: ApprovalListOptions,
    allInvolvedOptions: ApprovalListOptions,
): Promise<ApprovalsInbox> {
    const result = await adminApi(ApprovalsInboxDocument, { awaitingOptions, allInvolvedOptions });
    return result.myApprovalsInbox;
}

export async function fetchApprovalDetail(id: string): Promise<ApprovalRequestDetail | null> {
    const result = await adminApi(ApprovalDetailDocument, { id });
    return result.approvalRequest ?? null;
}

export async function decideApprovalRequest(
    requestType: string,
    requestId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
): Promise<void> {
    const document = DECIDE_DOCUMENT_BY_REQUEST_TYPE[
        requestType as keyof typeof DECIDE_DOCUMENT_BY_REQUEST_TYPE
    ] as typeof DecidePriceAdjustmentRequestDocument | undefined;
    if (!document) throw new Error(`No decide mutation known for requestType "${requestType}"`);
    await adminApi(document, { requestId, decision, comment: comment ?? null });
}

export interface OrderReferenceLine {
    id: string;
    productName: string;
    sku: string;
    quantity: number;
    discountedUnitPriceWithTax: number;
}

export interface OrderReference {
    id: string;
    code: string;
    customerName: string;
    lines: OrderReferenceLine[];
}

// Only priceAdjustmentApproval payloads carry orderId (see PriceAdjustmentPayload); batch-fetched
// Resolves lines too, so the detail page shows SKU and original price, not a bare orderLineId
export async function fetchOrderReferences(
    orderIds: string[],
): Promise<Map<string, OrderReference>> {
    if (!orderIds.length) return new Map();
    const result = await adminApi(ApprovalOrderReferencesDocument, { ids: orderIds });
    return new Map(
        result.visibleOrders.items.map(o => [
            o.id,
            {
                id: o.id,
                code: o.code,
                customerName: o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : '—',
                lines: o.lines.map(l => ({
                    id: l.id,
                    productName: l.productVariant.name,
                    sku: l.productVariant.sku,
                    quantity: l.quantity,
                    discountedUnitPriceWithTax: l.discountedUnitPriceWithTax,
                })),
            },
        ]),
    );
}

export interface CounterpartyReference {
    erpId: string;
    shortName: string;
}

// creditTermApproval payloads carry the ERP id, not the portal id (see CreditTermRequestInput),
// matched against caller's scoped counterparties; capped at 500 as a stopgap, not a true fix
export async function fetchCounterpartyReferencesByErpId(): Promise<
    Map<string, CounterpartyReference>
> {
    const result = await adminApi(ApprovalCounterpartiesDocument);
    return new Map(result.counterparties.items.map(c => [c.erpId, c]));
}

export async function escalateApprovalRequest(
    requestId: string,
    escalateToAdministratorId: string,
): Promise<void> {
    await adminApi(EscalateApprovalRequestDocument, { requestId, escalateToAdministratorId });
}

// The sidebar's Approvals badge count — recentLimit: 0 so the response carries only pendingCount,
// no row data.
export async function fetchPendingApprovalsBadgeCount(): Promise<number> {
    const result = await adminApi(PendingApprovalsBadgeCountDocument);
    return result.myApprovalRequestsSummary.pendingCount;
}
