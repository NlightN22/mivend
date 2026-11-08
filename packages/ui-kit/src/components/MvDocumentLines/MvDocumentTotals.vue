<script setup lang="ts">
export interface DocTotalRow {
    key: string;
    label: string;
    value: string;
    note?: string;
    emphasis?: boolean;
}

defineProps<{ rows: DocTotalRow[] }>();
</script>

<template>
    <dl class="mv-doc-totals">
        <div
            v-for="row in rows"
            :key="row.key"
            class="mv-doc-totals__row"
            :class="{ 'mv-doc-totals__row--total': row.emphasis }"
            :data-testid="`doc-total-${row.key}`"
        >
            <dt>{{ row.label }}</dt>
            <dd>
                <slot :name="`value-${row.key}`" :row="row">
                    <span v-if="row.note" class="mv-doc-totals__note">{{ row.note }}</span>
                    {{ row.value }}
                </slot>
            </dd>
        </div>
        <slot />
    </dl>
</template>

<style scoped>
.mv-doc-totals {
    width: min(100%, 380px);
    margin: 14px 0 0 auto;
    padding-top: 10px;
    border-top: 1px solid var(--el-border-color);
    font-size: 13px;
}

.mv-doc-totals__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 0;
}

.mv-doc-totals dt {
    color: var(--app-text-grey);
}

.mv-doc-totals dd {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
}

.mv-doc-totals__note {
    color: var(--app-text-grey);
    font-size: 12px;
}

.mv-doc-totals__row--total {
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--el-border-color);
    font-size: 18px;
    font-weight: 800;
}

.mv-doc-totals__row--total dt {
    color: var(--el-text-color-primary);
}
</style>
