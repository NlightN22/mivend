<script setup lang="ts">
import { computed } from 'vue';
import { IconRefresh } from '@tabler/icons-vue';
import { MvButton, MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetailLine } from '../../api/orderDetail';
import type { FindingConsequence } from '../../utils/findingConsequence';
import {
    findingDetail,
    findingTitle,
    type OrderCheckFinding,
} from '../../utils/orderCheckMessages';
import { checksSummary } from '../../utils/orderLineChecks';

const props = defineProps<{
    findings: OrderCheckFinding[];
    consequences: Map<string, FindingConsequence>;
    lines: OrderDetailLine[];
    canRecompute: boolean;
    recomputing: boolean;
    error: string;
}>();
const emit = defineEmits<{ recompute: []; goToContract: [] }>();

const stale = computed(() => props.findings.some(f => f.stale));
const hasContractIssue = computed(() => checksSummary(props.findings).hasContractIssue);

function lineName(finding: OrderCheckFinding): string | null {
    return props.lines.find(l => l.id === finding.lineRef)?.productVariant.name ?? null;
}
</script>

<template>
    <div class="findings">
        <div class="findings__head">
            <MvStatusBadge v-if="stale" variant="warning">Out of date</MvStatusBadge>
            <MvButton
                v-if="canRecompute"
                variant="secondary"
                size="sm"
                :disabled="recomputing"
                @click="emit('recompute')"
            >
                <IconRefresh :size="14" />
                {{ recomputing ? 'Recomputing…' : 'Recompute' }}
            </MvButton>
            <MvButton
                v-if="hasContractIssue"
                variant="secondary"
                size="sm"
                @click="emit('goToContract')"
            >
                Change contract
            </MvButton>
        </div>
        <p v-if="error" class="findings__error">{{ error }}</p>
        <p v-if="!findings.length" class="findings__empty">
            No findings. The ERP checks stock and contracts per line.
        </p>
        <ul v-else class="findings__list">
            <li v-for="f in findings" :key="f.id" class="findings__item">
                <div class="findings__text">
                    <span class="findings__title">{{ findingTitle(f.messageKey) }}</span>
                    <span v-if="lineName(f) || findingDetail(f)" class="findings__meta">
                        {{ [lineName(f), findingDetail(f)].filter(Boolean).join(' · ') }}
                    </span>
                </div>
                <MvStatusBadge
                    v-if="consequences.get(f.id)"
                    :variant="consequences.get(f.id)!.variant"
                >
                    {{ consequences.get(f.id)!.label }}
                </MvStatusBadge>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.findings {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.findings__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.findings__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.findings__item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
}

.findings__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.findings__title {
    font-weight: 600;
}

.findings__meta,
.findings__empty {
    margin: 0;
    color: var(--app-text-grey);
    font-size: 12px;
}

.findings__error {
    margin: 0;
    color: var(--app-danger-fg);
    font-size: 13px;
}
</style>
