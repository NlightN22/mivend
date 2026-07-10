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

export interface ApprovalsInbox {
    awaitingMyDecision: ApprovalRequestSummary[];
    allInvolved: ApprovalRequestSummary[];
}

export async function fetchApprovalsInbox(): Promise<ApprovalsInbox> {
    const result = await adminApi<{ myApprovalsInbox: ApprovalsInbox }>(
        `query {
            myApprovalsInbox {
                awaitingMyDecision { ${SUMMARY_FIELDS} }
                allInvolved { ${SUMMARY_FIELDS} }
            }
        }`,
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

export interface OrderReference {
    id: string;
    code: string;
    customerName: string;
}

// Batch lookup for priceAdjustmentApproval payloads (the only requestType whose payload
// references an orderId — see PriceAdjustmentPayload) — used to show "Order ORD-... · Customer"
// in the inbox table instead of a bare internal id.
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
            }[];
        };
    }>(
        `query($ids: [String!]!) {
            visibleOrders(options: { take: 200, filter: { id: { in: $ids } } }) {
                items { id code customer { firstName lastName } }
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
// list, same pattern as elsewhere in this portal.
export async function fetchCounterpartyReferencesByErpId(): Promise<
    Map<string, CounterpartyReference>
> {
    const result = await adminApi<{ counterparties: { erpId: string; shortName: string }[] }>(
        `query { counterparties { erpId shortName } }`,
    );
    return new Map(result.counterparties.map(c => [c.erpId, c]));
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
