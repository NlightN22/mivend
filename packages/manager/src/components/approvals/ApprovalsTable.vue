<script setup lang="ts">
import { computed, h } from 'vue';
import { useRouter } from 'vue-router';
import type { Column } from 'element-plus';
import { MvTable, MvStatusBadge, MvButton, MvTooltip } from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import {
    REQUEST_TYPE_LABEL,
    type ApprovalRequestSummary,
    type OrderReference,
    type CounterpartyReference,
} from '../../api/approvals';
import type { ManagerOption } from '../../api/orders';

const props = defineProps<{
    requests: ApprovalRequestSummary[];
    managers: ManagerOption[];
    orderReferences: Map<string, OrderReference>;
    counterpartyReferences: Map<string, CounterpartyReference>;
}>();
const router = useRouter();

function requesterName(id: string | null): string {
    if (!id) return '—';
    return props.managers.find(m => m.id === id)?.name ?? '—';
}

function referenceText(request: ApprovalRequestSummary): string {
    let payload: Record<string, unknown>;
    try {
        payload = JSON.parse(request.payload) as Record<string, unknown>;
    } catch {
        return '—';
    }
    if (request.requestType === 'priceAdjustmentApproval') {
        const ref = props.orderReferences.get(String(payload.orderId));
        return ref ? `${ref.code} · ${ref.customerName}` : `Order ${payload.orderId as string}`;
    }
    if (request.requestType === 'discountGrantApproval') {
        return `${payload.priceTypeCode as string} · ${(payload.facetValueCode as string | null) ?? 'all products'}`;
    }
    if (request.requestType.startsWith('creditTermApproval')) {
        const ref = props.counterpartyReferences.get(String(payload.counterpartyErpId));
        return ref ? ref.shortName : (payload.counterpartyErpId as string);
    }
    return '—';
}

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warning';
}

function isEscalated(request: ApprovalRequestSummary): boolean {
    const currentStep = request.steps.find(s => s.stepIndex === request.currentStepIndex);
    return !!currentStep?.wasEscalated;
}

function escalatedByName(request: ApprovalRequestSummary): string {
    const currentStep = request.steps.find(s => s.stepIndex === request.currentStepIndex);
    return requesterName(currentStep?.escalatedByAdministratorId ?? null);
}

const columns = computed<Column<TableRow>[]>(() => [
    { key: 'id', title: 'Request #', dataKey: 'id', width: 100 },
    {
        key: 'type',
        title: 'Type',
        dataKey: 'type',
        width: 200,
        cellRenderer: ({ rowData }) => {
            const row = rowData as TableRow;
            return h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                row.type as string,
                row.escalated
                    ? h(MvTooltip, {}, {
                          default: () => `Escalated by ${row.escalatedBy as string}`,
                          trigger: () => h('span', { 'aria-label': 'Escalated' }, '⚠'),
                      })
                    : null,
            ]);
        },
    },
    { key: 'reference', title: 'Customer / Reference', dataKey: 'reference', width: 220 },
    { key: 'requestedBy', title: 'Requested by', dataKey: 'requestedBy', width: 150 },
    { key: 'currentStep', title: 'Current step', dataKey: 'currentStep', width: 200 },
    { key: 'submittedDate', title: 'Submitted', dataKey: 'submittedDate', width: 120 },
    {
        key: 'status',
        title: 'Status',
        dataKey: 'status',
        width: 120,
        cellRenderer: ({ rowData }) =>
            h(MvStatusBadge, { variant: statusVariant((rowData as TableRow).status as string) }, () =>
                (rowData as TableRow).status as string,
            ),
    },
    {
        key: 'action',
        title: '',
        dataKey: 'action',
        width: 100,
        cellRenderer: ({ rowData }) =>
            h(
                MvButton,
                { size: 'sm', onClick: () => router.push(`/approvals/${(rowData as TableRow).id as string}`) },
                () => 'Review',
            ),
    },
]);

const rows = computed<TableRow[]>(() =>
    props.requests.map(request => ({
        id: request.id,
        type: REQUEST_TYPE_LABEL[request.requestType] ?? request.requestType,
        reference: referenceText(request),
        requestedBy: requesterName(request.requestedByAdministratorId),
        currentStep:
            request.status === 'pending'
                ? `Step ${request.currentStepIndex + 1} of ${request.totalSteps} — ${request.currentStepRole ?? ''}`
                : '—',
        submittedDate: new Date(request.createdAt).toLocaleDateString('en-US'),
        status: request.status,
        escalated: isEscalated(request),
        escalatedBy: escalatedByName(request),
    })),
);
</script>

<template>
    <MvTable
        :columns="columns"
        :data="rows"
        :height="Math.max(rows.length, 1) * 52 + 40"
        empty-text="No requests awaiting your decision"
    />
</template>
