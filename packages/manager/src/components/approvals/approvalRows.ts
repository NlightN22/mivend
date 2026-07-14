import type { TableRow } from '@mivend/ui-kit';
import type { TableFilterFieldDef } from '@mivend/ui-kit';
import {
    REQUEST_TYPE_LABEL,
    type ApprovalRequestSummary,
    type OrderReference,
    type CounterpartyReference,
} from '../../api/approvals';
import type { ManagerOption } from '../../api/orders';

// Filtering/pagination moved server-side (see api/approvals.ts's ApprovalListOptions and
// ApprovalRequestService.findAwaitingMyDecision/findAllInvolving) — so unlike a fully
// client-loaded table, the filter list here is capped to exactly what the backend can push into
// SQL: request id (substring), requestType (exact), status (exact). Columns that only exist
// after resolving other entities client-side (reference/requestedBy/currentStep) are shown in
// ApprovalsTable but are NOT filterable — filtering them would need the backend to also resolve
// order/counterparty/manager names, which it doesn't do today (see PROJECT_CONTEXT.md).
export const APPROVAL_FILTER_FIELDS: TableFilterFieldDef[] = [
    { key: 'id', label: 'Request #', type: 'search', placeholder: 'e.g. 8' },
    {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
            { value: '', label: 'All types' },
            ...Object.entries(REQUEST_TYPE_LABEL).map(([value, label]) => ({ value, label })),
        ],
    },
    {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
            { value: '', label: 'All statuses' },
            { value: 'pending', label: 'pending' },
            { value: 'approved', label: 'approved' },
            { value: 'rejected', label: 'rejected' },
        ],
    },
];

function requesterName(managers: ManagerOption[], id: string | null): string {
    if (!id) return '—';
    return managers.find(m => m.id === id)?.name ?? '—';
}

function referenceText(
    request: ApprovalRequestSummary,
    orderReferences: Map<string, OrderReference>,
    counterpartyReferences: Map<string, CounterpartyReference>,
): string {
    let payload: Record<string, unknown>;
    try {
        payload = JSON.parse(request.payload) as Record<string, unknown>;
    } catch {
        return '—';
    }
    if (request.requestType === 'priceAdjustmentApproval') {
        const ref = orderReferences.get(String(payload.orderId));
        return ref ? `${ref.code} · ${ref.customerName}` : `Order ${payload.orderId as string}`;
    }
    if (request.requestType === 'discountGrantApproval') {
        return `${payload.priceTypeCode as string} · ${(payload.facetValueCode as string | null) ?? 'all products'}`;
    }
    if (request.requestType.startsWith('creditTermApproval')) {
        const ref = counterpartyReferences.get(String(payload.counterpartyErpId));
        return ref ? ref.shortName : (payload.counterpartyErpId as string);
    }
    return '—';
}

function isEscalated(request: ApprovalRequestSummary): boolean {
    const currentStep = request.steps.find(s => s.stepIndex === request.currentStepIndex);
    return !!currentStep?.wasEscalated;
}

function escalatedByName(request: ApprovalRequestSummary, managers: ManagerOption[]): string {
    const currentStep = request.steps.find(s => s.stepIndex === request.currentStepIndex);
    return requesterName(managers, currentStep?.escalatedByAdministratorId ?? null);
}

export function buildApprovalRows(
    requests: ApprovalRequestSummary[],
    managers: ManagerOption[],
    orderReferences: Map<string, OrderReference>,
    counterpartyReferences: Map<string, CounterpartyReference>,
): TableRow[] {
    return requests.map(request => ({
        id: request.id,
        // Kept as the raw requestType code (not the label) so the Type select filter — whose
        // options are keyed by code, see APPROVAL_FILTER_FIELDS above — matches directly;
        // ApprovalsTable's cellRenderer looks up the label for display.
        type: request.requestType,
        reference: referenceText(request, orderReferences, counterpartyReferences),
        requestedBy: requesterName(managers, request.requestedByAdministratorId),
        currentStep:
            request.status === 'pending'
                ? `Step ${request.currentStepIndex + 1} of ${request.totalSteps} — ${request.currentStepRole ?? ''}`
                : '—',
        submittedDate: new Date(request.createdAt).toLocaleDateString('en-US'),
        status: request.status,
        escalated: isEscalated(request),
        escalatedBy: escalatedByName(request, managers),
    }));
}
