<script setup lang="ts">
// Horizontal approval-chain stepper — see docs/ai/manager-portal-pages/00-shared-conventions.md
// ("ApprovalStepper") and 11-approval-detail.md. One step per role in the chain; state drives
// the circle style and the connecting line before it.
export type ApprovalStepState = 'done' | 'current' | 'pending' | 'escalated' | 'rejected';

export interface ApprovalStepperItem {
    label: string;
    state: ApprovalStepState;
    meta?: string;
}

defineProps<{ steps: ApprovalStepperItem[] }>();
</script>

<template>
    <ol class="mv-approval-stepper">
        <li
            v-for="(step, index) in steps"
            :key="step.label + index"
            class="mv-approval-stepper__item"
            :class="`mv-approval-stepper__item--${step.state}`"
        >
            <div class="mv-approval-stepper__row">
                <span v-if="index > 0" class="mv-approval-stepper__line" />
                <span class="mv-approval-stepper__dot">
                    <template v-if="step.state === 'done'">✓</template>
                    <template v-else-if="step.state === 'escalated'">⇄</template>
                    <template v-else-if="step.state === 'rejected'">✕</template>
                </span>
            </div>
            <div class="mv-approval-stepper__label">{{ step.label }}</div>
            <div v-if="step.meta" class="mv-approval-stepper__meta">{{ step.meta }}</div>
        </li>
    </ol>
</template>

<style scoped>
.mv-approval-stepper {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
}

.mv-approval-stepper__item {
    flex: 1;
    text-align: center;
    min-width: 0;
}

.mv-approval-stepper__row {
    display: flex;
    align-items: center;
}

.mv-approval-stepper__line {
    flex: 1;
    height: 2px;
    background: var(--el-border-color, #e4e7ec);
}

.mv-approval-stepper__item--done .mv-approval-stepper__line {
    background: var(--el-color-primary, #00b894);
}

.mv-approval-stepper__dot {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 700;
    background: #fff;
    border: 2px solid var(--el-border-color, #e4e7ec);
    color: var(--el-text-color-secondary, #6b7280);
    margin: 0 auto;
}

.mv-approval-stepper__item:first-child .mv-approval-stepper__row {
    justify-content: center;
}

.mv-approval-stepper__item--done .mv-approval-stepper__dot {
    background: var(--el-color-primary, #00b894);
    border-color: var(--el-color-primary, #00b894);
    color: #fff;
}

.mv-approval-stepper__item--current .mv-approval-stepper__dot {
    border-color: var(--el-color-primary, #00b894);
    color: var(--el-color-primary-dark-2, #008a70);
}

.mv-approval-stepper__item--escalated .mv-approval-stepper__dot {
    background: #fffbeb;
    border-color: #f59e0b;
    color: #b45309;
}

.mv-approval-stepper__item--rejected .mv-approval-stepper__dot {
    background: #fee2e2;
    border-color: #dc2626;
    color: #dc2626;
}

.mv-approval-stepper__label {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.mv-approval-stepper__meta {
    margin-top: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    padding: 0 8px;
}
</style>
