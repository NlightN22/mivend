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

// requestType is fixed by the workflow engine, not ERP business data (see
// docs/access-control.md) — this dispatch table is the documented carve-out, mirroring the
// CREATE_PERMISSION_BY_REQUEST_TYPE map in approval-workflow.resolver.ts. creditTermApproval and
// its escalated variant share one mutation — see CreditTermService.decideAndApply.
export const REQUEST_TYPE_LABEL: Record<string, string> = {
    priceAdjustmentApproval: 'Price adjustment',
    discountGrantApproval: 'Discount grant',
    creditTermApproval: 'Payment term extension',
    creditTermApprovalEscalated: 'Payment term extension (escalated)',
};

// Each requestType's decide mutation is a distinct, statically-named GraphQL operation (codegen
// requires this — no dynamic mutation-name string interpolation) — dispatch by generated
// Document instead of by mutation-name string.
const DECIDE_DOCUMENT_BY_REQUEST_TYPE = {
    priceAdjustmentApproval: DecidePriceAdjustmentRequestDocument,
    discountGrantApproval: DecideDiscountGrantRequestDocument,
    creditTermApproval: DecideCreditTermRequestDocument,
    creditTermApprovalEscalated: DecideCreditTermRequestDocument,
} as const;

// Mirrors the backend's ApprovalListOptions (packages/plugins/approval-workflow/src/types.ts) —
// eligibility/pagination/filtering now all happen server-side, see approval-request.service.ts's
// "Approvals inbox: real server-side pagination" for why the old fetch-everything-then-filter
// version was rejected.
export interface ApprovalListOptions {
    take?: number;
    skip?: number;
    search?: string;
    requestType?: string;
    status?: string;
}

// One request returns both tabs so the "Awaiting my decision" badge count stays accurate no
// matter which tab is active — pass { take: 0 } for whichever tab isn't currently displayed to
// fetch only its totalItems, not a page of rows nobody's looking at.
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
    unitPriceWithTax: number;
}

export interface OrderReference {
    id: string;
    code: string;
    customerName: string;
    lines: OrderReferenceLine[];
}

// Batch lookup for priceAdjustmentApproval payloads (the only requestType whose payload
// references an orderId — see PriceAdjustmentPayload) — used to show "Order ORD-... · Customer"
// in the inbox table, and (via `lines`) the actual product/SKU/original-price context on the
// detail page instead of a bare orderLineId.
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
                    unitPriceWithTax: l.unitPriceWithTax,
                })),
            },
        ]),
    );
}

export interface CounterpartyReference {
    erpId: string;
    shortName: string;
}

// creditTermApproval payloads reference a counterparty by ERP id, not the portal's internal id
// (see CreditTermRequestInput) — matched against the caller's own already-scoped counterparties
// list. Bounded at 500 (see issue #39) — same stopgap as fetchAllCustomersCapped in
// api/customers.ts, not a true fix.
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
