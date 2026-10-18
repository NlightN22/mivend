<script setup lang="ts">
import { computed } from 'vue';
import { IconAlertTriangle, IconCircleCheck, IconRefresh } from '@tabler/icons-vue';
import { MvButton, MvCard, MvStatusBadge } from '@mivend/ui-kit';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { findingDetail, findingTitle } from '../../utils/orderCheckMessages';
import { checksSummary } from '../../utils/orderLineChecks';

const props = defineProps<{
    findings: OrderCheckFinding[];
    notRegistered: boolean;
    erpStatus: string | null;
    canSeeChecks: boolean;
    canRecompute: boolean;
    recomputing: boolean;
    error: string;
}>();
const emit = defineEmits<{ goToContract: []; recompute: [] }>();

const summary = computed(() => checksSummary(props.findings));
const stale = computed(() => props.findings.some(f => f.stale));
const clean = computed(() => !props.findings.length);
</script>

<template>
    <div class="status-cards">
        <MvCard v-if="canSeeChecks" padding="14px 16px" class="status-card">
            <IconCircleCheck v-if="clean" :size="26" class="status-card__icon--ok" />
            <IconAlertTriangle v-else :size="26" class="status-card__icon--warn" />
            <div class="status-card__body">
                <div class="status-card__head">
                    <strong>Order controls</strong>
                    <MvButton
                        v-if="canRecompute"
                        variant="secondary"
                        size="sm"
                        class="status-card__recompute"
                        :disabled="recomputing"
                        @click="emit('recompute')"
                    >
                        <IconRefresh :size="14" />
                        {{ recomputing ? 'Recomputing…' : 'Recompute' }}
                    </MvButton>
                </div>
                <p v-if="clean">No findings. The ERP checks stock and contracts per line.</p>
                <p v-else>
                    The order is accepted; these controls inform you or hold the automatic
                    confirmation until a manager confirms.
                    <template v-if="summary.lineCount">
                        {{ summary.lineCount }} line(s) do not meet ERP requirements (see the order
                        lines).
                    </template>
                </p>
                <MvStatusBadge v-if="stale" variant="warning">Out of date</MvStatusBadge>
                <ul v-if="summary.listed.length" class="status-card__list">
                    <li v-for="f in summary.listed" :key="f.id">
                        {{ findingTitle(f.messageKey) }}
                        <span v-if="findingDetail(f)">({{ findingDetail(f) }})</span>
                    </li>
                </ul>
                <p v-if="error" class="status-card__error">{{ error }}</p>
                <MvButton
                    v-if="summary.hasContractIssue"
                    variant="secondary"
                    size="sm"
                    @click="emit('goToContract')"
                >
                    Change contract
                </MvButton>
            </div>
        </MvCard>
        <MvCard padding="14px 16px" class="status-card">
            <IconAlertTriangle v-if="notRegistered" :size="26" class="status-card__icon--warn" />
            <IconCircleCheck v-else :size="26" class="status-card__icon--ok" />
            <div class="status-card__body">
                <strong>ERP registration</strong>
                <p v-if="notRegistered">Not registered in the ERP yet.</p>
                <p v-else>{{ erpStatus ?? 'Registered or not yet due.' }}</p>
            </div>
        </MvCard>
    </div>
</template>

<style scoped>
.status-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
    align-items: stretch;
}

.status-card {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    font-size: 13px;
}

.status-card__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    min-width: 0;
}

.status-card__head strong {
    white-space: nowrap;
}

.status-card__head {
    display: flex;
    align-items: center;
    gap: 8px;
    align-self: stretch;
}

.status-card__recompute {
    margin-left: auto;
}

.status-card__body p {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.status-card__list {
    margin: 0;
    padding-left: 18px;
    color: var(--el-text-color-secondary, #6b7280);
}

.status-card__body p.status-card__error {
    color: var(--el-color-danger, #dc2626);
}

.status-card svg {
    flex-shrink: 0;
}

.status-card__icon--ok {
    color: var(--el-color-success, #059669);
}

.status-card__icon--warn {
    color: var(--el-color-warning, #d97706);
}
</style>
