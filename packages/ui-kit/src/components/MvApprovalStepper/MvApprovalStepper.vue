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
    background: var(--el-border-color);
}

.mv-approval-stepper__item--done .mv-approval-stepper__line {
    background: var(--el-color-primary);
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
    background: var(--app-surface);
    border: 2px solid var(--el-border-color);
    color: var(--el-text-color-secondary);
    margin: 0 auto;
}

.mv-approval-stepper__item:first-child .mv-approval-stepper__row {
    justify-content: center;
}

.mv-approval-stepper__item--done .mv-approval-stepper__dot {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: var(--app-on-accent);
}

.mv-approval-stepper__item--current .mv-approval-stepper__dot {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary-dark-2);
}

.mv-approval-stepper__item--escalated .mv-approval-stepper__dot {
    background: var(--app-warn2-bg);
    border-color: var(--app-sel-warn-bd);
    color: var(--app-orange-fg);
}

.mv-approval-stepper__item--rejected .mv-approval-stepper__dot {
    background: var(--app-danger-bg);
    border-color: var(--app-danger-btn-hover);
    color: var(--app-danger-btn-hover);
}

.mv-approval-stepper__label {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary);
}

.mv-approval-stepper__meta {
    margin-top: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    padding: 0 8px;
}
</style>
