import { adminApi } from './client';

export interface ApprovalStepAudit {
    id: string;
    stepIndex: number;
    requiredRole: string;
    approverAdministratorId: string | null;
    wasEscalated: boolean;
    escalatedByAdministratorId: string | null;
    escalatedToAdministratorId: string | null;
    decision: string | null;
    comment: string | null;
    decidedAt: string | null;
}

export interface ApprovalRequestSummary {
    id: string;
    requestType: string;
    status: string;
    currentStepIndex: number;
    currentStepRole: string | null;
    stepRoles: string[];
    totalSteps: number;
    requestedByAdministratorId: string | null;
    createdAt: string;
    decidedAt: string | null;
    payload: string;
    steps: ApprovalStepAudit[];
}

export interface ApprovalRequestDetail extends ApprovalRequestSummary {
    escalatesTo: string[];
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

const DECIDE_MUTATION_BY_REQUEST_TYPE: Record<string, string> = {
    priceAdjustmentApproval: 'decidePriceAdjustmentRequest',
    discountGrantApproval: 'decideDiscountGrantRequest',
    creditTermApproval: 'decideCreditTermRequest',
    creditTermApprovalEscalated: 'decideCreditTermRequest',
};

const SUMMARY_FIELDS = `
    id
    requestType
    status
    currentStepIndex
    currentStepRole
    stepRoles
    totalSteps
    requestedByAdministratorId
    createdAt
    decidedAt
    payload
    steps {
        id
        stepIndex
        requiredRole
        approverAdministratorId
        wasEscalated
        escalatedByAdministratorId
        escalatedToAdministratorId
        decision
        comment
        decidedAt
    }
`;

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

export interface ApprovalRequestPage {
    items: ApprovalRequestSummary[];
    totalItems: number;
}

export interface ApprovalsInbox {
    awaitingMyDecision: ApprovalRequestPage;
    allInvolved: ApprovalRequestPage;
}

const PAGE_FIELDS = `items { ${SUMMARY_FIELDS} } totalItems`;

// One request returns both tabs so the "Awaiting my decision" badge count stays accurate no
// matter which tab is active — pass { take: 0 } for whichever tab isn't currently displayed to
// fetch only its totalItems, not a page of rows nobody's looking at.
export async function fetchApprovalsInbox(
    awaitingOptions: ApprovalListOptions,
    allInvolvedOptions: ApprovalListOptions,
): Promise<ApprovalsInbox> {
    const result = await adminApi<{ myApprovalsInbox: ApprovalsInbox }>(
        `query($awaitingOptions: ApprovalListOptions, $allInvolvedOptions: ApprovalListOptions) {
            myApprovalsInbox(awaitingOptions: $awaitingOptions, allInvolvedOptions: $allInvolvedOptions) {
                awaitingMyDecision { ${PAGE_FIELDS} }
                allInvolved { ${PAGE_FIELDS} }
            }
        }`,
        { awaitingOptions, allInvolvedOptions },
    );
    return result.myApprovalsInbox;
}

export async function fetchApprovalDetail(id: string): Promise<ApprovalRequestDetail | null> {
    const result = await adminApi<{ approvalRequest: ApprovalRequestDetail | null }>(
        `query($id: ID!) {
            approvalRequest(id: $id) {
                ${SUMMARY_FIELDS}
                escalatesTo
            }
        }`,
        { id },
    );
    return result.approvalRequest;
}

export async function decideApprovalRequest(
    requestType: string,
    requestId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
): Promise<void> {
    const mutationName = DECIDE_MUTATION_BY_REQUEST_TYPE[requestType];
    if (!mutationName) throw new Error(`No decide mutation known for requestType "${requestType}"`);
    await adminApi(
        `mutation($requestId: ID!, $decision: String!, $comment: String) {
            ${mutationName}(requestId: $requestId, decision: $decision, comment: $comment) { id }
        }`,
        { requestId, decision, comment },
    );
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
    const result = await adminApi<{
        visibleOrders: {
            items: {
                id: string;
                code: string;
                customer: { firstName: string; lastName: string } | null;
                lines: {
                    id: string;
                    quantity: number;
                    unitPriceWithTax: number;
                    productVariant: { name: string; sku: string };
                }[];
            }[];
        };
    }>(
        `query($ids: [String!]!) {
            visibleOrders(options: { take: 200, filter: { id: { in: $ids } } }) {
                items {
                    id code
                    customer { firstName lastName }
                    lines {
                        id quantity unitPriceWithTax
                        productVariant { name sku }
                    }
                }
            }
        }`,
        { ids: orderIds },
    );
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
    const result = await adminApi<{
        counterparties: { items: { erpId: string; shortName: string }[] };
    }>(`query { counterparties(options: { take: 500 }) { items { erpId shortName } } }`);
    return new Map(result.counterparties.items.map(c => [c.erpId, c]));
}

export async function escalateApprovalRequest(
    requestId: string,
    escalateToAdministratorId: string,
): Promise<void> {
    await adminApi(
        `mutation($requestId: ID!, $escalateToAdministratorId: ID!) {
            escalateApprovalRequest(
                requestId: $requestId
                escalateToAdministratorId: $escalateToAdministratorId
            ) { id }
        }`,
        { requestId, escalateToAdministratorId },
    );
}
