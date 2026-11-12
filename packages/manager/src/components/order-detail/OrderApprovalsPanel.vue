<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../../api/orderDetail';

const { t } = useI18n();
const props = defineProps<{
    requests: PriceAdjustmentRequestSummary[];
    lines: OrderDetailLine[];
}>();

const STATUS_TEXT = ['approved', 'rejected'];

function variant(status: string): 'success' | 'danger' | 'warning' {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warning';
}

function statusText(request: PriceAdjustmentRequestSummary): string {
    if (request.status === 'pending') {
        return request.currentStepRole
            ? t('orderDetail.approvals.waitingOn', { role: request.currentStepRole })
            : t('orderDetail.approvals.pending');
    }
    return STATUS_TEXT.includes(request.status)
        ? t(`orderDetail.approvals.${request.status}`)
        : request.status;
}

function lineName(payload: string): string | null {
    try {
        const lineId = (JSON.parse(payload) as { orderLineId?: string }).orderLineId;
        return props.lines.find(l => l.id === lineId)?.productVariant.name ?? null;
    } catch {
        return null;
    }
}

const rows = computed(() => props.requests.map(r => ({ request: r, line: lineName(r.payload) })));
</script>

<template>
    <ul class="approvals">
        <li v-for="{ request, line } in rows" :key="request.id" class="approvals__item">
            <RouterLink :to="`/approvals/${request.id}`" class="approvals__link">
                {{
                    t('orderDetail.approvals.price', {
                        line: line ?? t('orderDetail.approvals.requestNumber', { id: request.id }),
                    })
                }}
                <span class="approvals__meta">
                    {{ formatDate(request.createdAt) }}
                </span>
            </RouterLink>
            <MvStatusBadge :variant="variant(request.status)">{{
                statusText(request)
            }}</MvStatusBadge>
        </li>
    </ul>
    <p v-if="!requests.length" class="approvals__empty">
        {{ t('orderDetail.approvals.empty') }}
    </p>
</template>

<style scoped>
.approvals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.approvals__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
}

.approvals__link {
    display: flex;
    flex-direction: column;
    color: var(--el-text-color-primary);
    text-decoration: none;
    font-weight: 600;
}

.approvals__link:hover {
    color: var(--el-color-primary-dark-2);
}

.approvals__meta {
    color: var(--app-text-grey);
    font-size: 12px;
    font-weight: 400;
}

.approvals__empty {
    margin: 0;
    color: var(--app-text-grey);
    font-size: 13px;
}
</style>
