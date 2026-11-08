import type { StatusBadgeVariant } from '@mivend/ui-kit';
import {
    REQUEST_TYPE_LABEL,
    type ApprovalRequestSummary,
    type CounterpartyReference,
    type OrderReference,
} from '../../api/approvals';
import type { ManagerOption } from '../../api/orders';
import { APPROVAL_STATUS_LABEL } from './approvalsColumns';

export type ApprovalListRow = {
    id: string;
    type: string;
    subject: string;
    requested: string;
    requestedBy: string;
    step: string;
    createdAt: string;
    status: string;
    statusVariant: StatusBadgeVariant;
    escalated: boolean;
    escalatedBy: string;
};

export interface ApprovalRowContext {
    managers: ManagerOption[];
    orders: Map<string, OrderReference>;
    counterparties: Map<string, CounterpartyReference>;
    money: (minor: number) => string;
}

export const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    approved: 'success',
    rejected: 'danger',
    pending: 'warning',
};

export function parsePayload(raw: string): Record<string, unknown> {
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function managerName(managers: ManagerOption[], id: string | null): string {
    if (!id) return '—';
    return managers.find(m => m.id === id)?.name ?? '—';
}

function subjectOf(request: ApprovalRequestSummary, ctx: ApprovalRowContext): string {
    const p = parsePayload(request.payload);
    if (request.requestType === 'priceAdjustmentApproval') {
        const ref = ctx.orders.get(String(p.orderId));
        return ref ? `Order ${ref.code} · ${ref.customerName}` : `Order ${String(p.orderId)}`;
    }
    if (request.requestType === 'discountGrantApproval') {
        return `${String(p.priceTypeCode)} · ${(p.facetValueCode as string | null) ?? 'all products'}`;
    }
    if (request.requestType.startsWith('creditTermApproval')) {
        return (
            ctx.counterparties.get(String(p.counterpartyErpId))?.shortName ??
            String(p.counterpartyErpId)
        );
    }
    return '—';
}

function requestedOf(request: ApprovalRequestSummary, ctx: ApprovalRowContext): string {
    const p = parsePayload(request.payload);
    if (request.requestType === 'priceAdjustmentApproval' && typeof p.requestedPrice === 'number')
        return ctx.money(p.requestedPrice);
    if (request.requestType === 'discountGrantApproval' && p.percent != null)
        return `${String(p.percent)}%`;
    if (request.requestType.startsWith('creditTermApproval') && p.requestedExtraDays != null)
        return `+${String(p.requestedExtraDays)} days`;
    return '—';
}

export function toApprovalRows(
    requests: ApprovalRequestSummary[],
    ctx: ApprovalRowContext,
): ApprovalListRow[] {
    return requests.map(r => {
        const current = r.steps.find(s => s.stepIndex === r.currentStepIndex);
        return {
            id: r.id,
            type: REQUEST_TYPE_LABEL[r.requestType] ?? r.requestType,
            subject: subjectOf(r, ctx),
            requested: requestedOf(r, ctx),
            requestedBy: managerName(ctx.managers, r.requestedByAdministratorId),
            step:
                r.status === 'pending'
                    ? `${r.currentStepIndex + 1} of ${r.totalSteps} · ${r.currentStepRole ?? ''}`
                    : '—',
            createdAt: r.createdAt,
            status: APPROVAL_STATUS_LABEL[r.status] ?? r.status,
            statusVariant: STATUS_VARIANT[r.status] ?? 'neutral',
            escalated: r.status === 'pending' && !!current?.wasEscalated,
            escalatedBy: managerName(ctx.managers, current?.escalatedByAdministratorId ?? null),
        };
    });
}
