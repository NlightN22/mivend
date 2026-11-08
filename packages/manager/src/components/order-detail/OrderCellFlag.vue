<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvButton, MvFlagChip, MvPopover, MvStatusBadge } from '@mivend/ui-kit';
import type { FindingConsequence } from '../../utils/findingConsequence';
import { findingDetail, findingTitle } from '../../utils/orderCheckMessages';
import type { CellProblem } from '../../utils/orderLineProblems';

const props = defineProps<{
    problem: CellProblem;
    consequences: Map<string, FindingConsequence>;
    canConfirm: boolean;
    canReject: boolean;
}>();
const emit = defineEmits<{ confirm: []; reject: [] }>();

const open = ref(false);
const blocked = computed(() =>
    props.problem.findings.some(f => props.consequences.get(f.id)?.consequence === 'block'),
);

function act(action: 'confirm' | 'reject'): void {
    open.value = false;
    if (action === 'confirm') emit('confirm');
    else emit('reject');
}
</script>

<template>
    <MvPopover v-model:open="open" :width="300">
        <template #trigger>
            <MvFlagChip :tone="problem.tone" label="Show what is wrong here">
                <slot />
            </MvFlagChip>
        </template>
        <ul class="cell-flag__list">
            <li v-for="note in problem.notes" :key="note" class="cell-flag__item">{{ note }}</li>
            <li v-for="f in problem.findings" :key="f.id" class="cell-flag__item">
                <span class="cell-flag__title">{{ findingTitle(f.messageKey) }}</span>
                <span v-if="findingDetail(f)" class="cell-flag__meta">{{ findingDetail(f) }}</span>
                <span v-if="consequences.get(f.id)" class="cell-flag__consequence">
                    <span class="cell-flag__meta">Consequence:</span>
                    <MvStatusBadge :variant="consequences.get(f.id)!.variant">
                        {{ consequences.get(f.id)!.label }}
                    </MvStatusBadge>
                </span>
            </li>
        </ul>
        <div v-if="(canConfirm && !blocked) || canReject" class="cell-flag__actions">
            <MvButton v-if="canConfirm && !blocked" size="sm" @click="act('confirm')">
                Confirm
            </MvButton>
            <MvButton v-if="canReject" size="sm" variant="secondary" @click="act('reject')">
                Reject
            </MvButton>
        </div>
    </MvPopover>
</template>

<style scoped>
.cell-flag__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.cell-flag__item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
}

.cell-flag__title {
    font-weight: 700;
}

.cell-flag__meta {
    color: var(--app-text-grey);
    font-size: 12px;
}

.cell-flag__consequence {
    display: flex;
    align-items: center;
    gap: 6px;
}

.cell-flag__actions {
    display: flex;
    gap: 8px;
}
</style>
