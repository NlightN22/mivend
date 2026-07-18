<script setup lang="ts">
// Backoffice KPI tile — dashboard-style metric card reused across manager portal pages
// (Dashboard, and future per-section summaries). See docs/ai/manager-portal-pages/
// 00-shared-conventions.md.
// KPI-REUSE-GUARD: always wrap a row of these in <MvKpiCarousel>, never a page-local
// grid/flex row — a hand-rolled KPI row is a duplicate implementation, not a variant.
// grep "KPI-REUSE-GUARD" to find this note; grep for ".kpi" + "display: grid" together
// in packages/manager to catch a future page that skipped MvKpiCarousel.
withDefaults(
    defineProps<{
        label: string;
        value: number | string;
        caption?: string;
        to?: string;
        accent?: boolean;
    }>(),
    { accent: false },
);
</script>

<template>
    <component
        :is="to ? 'RouterLink' : 'div'"
        :to="to"
        class="mv-kpi-card"
        :class="{ 'mv-kpi-card--clickable': !!to, 'mv-kpi-card--accent': accent }"
    >
        <span class="mv-kpi-card__label">{{ label }}</span>
        <span class="mv-kpi-card__value">{{ value }}</span>
        <span v-if="caption" class="mv-kpi-card__caption">{{ caption }}</span>
    </component>
</template>

<style scoped>
.mv-kpi-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--app-surface, #fff);
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-lg, 16px);
    padding: 18px;
    text-decoration: none;
    color: inherit;
    box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
    transition:
        transform 0.16s ease,
        box-shadow 0.16s ease,
        border-color 0.16s ease;
}

.mv-kpi-card--clickable {
    cursor: pointer;
}

.mv-kpi-card--clickable:hover {
    transform: translateY(-2px);
    border-color: var(--el-border-color-light, #d1d5db);
    box-shadow: var(--app-shadow-md, 0 10px 28px rgba(16, 24, 40, 0.08));
}

.mv-kpi-card--accent .mv-kpi-card__value {
    color: var(--app-accent-orange, #b45309);
}

.mv-kpi-card__label {
    font-weight: 700;
    font-size: 13px;
    color: var(--el-text-color-secondary, #667085);
}

.mv-kpi-card__value {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--el-text-color-primary, #17212b);
}

.mv-kpi-card__caption {
    font-size: 12px;
    color: var(--el-text-color-secondary, #667085);
}
</style>
