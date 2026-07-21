<script setup lang="ts" generic="TRow extends Record<string, unknown>">
import { computed } from 'vue';
import MvPagination from '../MvPagination/MvPagination.vue';
import type { AdvancedDataTableColumn, AdvancedDataTableRowClickPayload } from './advancedDataTableTypes';

// MvAdvancedDataTable's mobile counterpart to its own PrimeVue-based desktop <DataTable> — see
// MvAdvancedDataTable.vue's own doc comment for why this exists as a separate render path rather
// than a toggle within the same markup (PrimeVue's DataTable/paginator/filter-overlay chrome has
// no mobile-card equivalent to fall back to).
//
// Deliberately simpler than the desktop view, matching what every hand-rolled isMobile branch
// this replaces already did: no sort, no per-column filters, no column resize/reorder — a card
// list has no header row for any of that UI to live in. Column order/visibility (from the
// consumer's tableState) and the toolbar search box still apply; sort/filter are desktop-only.
//
// Cell content reuses the exact same `#cell-<field>` slot mechanism as the desktop view — see
// MvAdvancedDataTable.vue's template for how each named slot is forwarded down here unchanged
// (Vue's `<slot name="...">` is a plain template construct, not tied to being rendered inside a
// PrimeVue <Column>, so the same slot content works in either layout with no extra plumbing).
const props = defineProps<{
    columns: AdvancedDataTableColumn[];
    rows: TRow[];
    dataKey: string;
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    emptyMessage: string;
}>();

const emit = defineEmits<{
    'row-click': [payload: AdvancedDataTableRowClickPayload<TRow>];
    'update:page': [page: number];
}>();

const primaryColumn = computed(() => props.columns.find(c => c.mobile?.primary));
const badgeColumn = computed(() => props.columns.find(c => c.mobile?.badge));
const fieldColumns = computed(() => props.columns.filter(c => !c.mobile?.primary && !c.mobile?.badge && !c.mobile?.hidden));

function rowKey(row: TRow): unknown {
    return row[props.dataKey];
}
</script>

<template>
    <div class="mv-advanced-mobile-cards">
        <p v-if="!loading && !rows.length" class="mv-advanced-mobile-cards__empty">
            <slot name="empty">{{ emptyMessage }}</slot>
        </p>
        <article
            v-for="row in rows"
            :key="String(rowKey(row))"
            class="mv-advanced-mobile-card"
            @click="emit('row-click', { row, originalEvent: $event })"
        >
            <div class="mv-advanced-mobile-card__head">
                <div class="mv-advanced-mobile-card__title">
                    <slot v-if="primaryColumn" :name="`cell-${primaryColumn.field}`" :data="row" />
                </div>
                <div v-if="badgeColumn" class="mv-advanced-mobile-card__badge">
                    <slot :name="`cell-${badgeColumn.field}`" :data="row" />
                </div>
            </div>

            <div class="mv-advanced-mobile-card__grid">
                <div v-for="col in fieldColumns" :key="col.field" class="mv-advanced-mobile-card__field">
                    <div class="mv-advanced-mobile-card__label">{{ col.header }}</div>
                    <div class="mv-advanced-mobile-card__value">
                        <slot :name="`cell-${col.field}`" :data="row" />
                    </div>
                </div>
            </div>
        </article>

        <MvPagination :page="page" :page-size="pageSize" :total="totalItems" @update:page="emit('update:page', $event)" />
    </div>
</template>

<style scoped>
/* Same visual language as MvTable's MvMobileCardList.vue — a tinted background behind white
   cards is the only separation that survives a real phone screen (a border+shadow alone read as
   one continuous block there, even though they look fine zoomed in on a screenshot). */
.mv-advanced-mobile-cards {
    display: grid;
    gap: 12px;
    background: var(--el-fill-color-light, #f1f4f7);
    padding: 10px;
    border-radius: 12px;
}

.mv-advanced-mobile-cards__empty {
    padding: 24px;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 14px;
}

.mv-advanced-mobile-card {
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    border-radius: 12px;
    padding: 13px;
    display: grid;
    gap: 11px;
    cursor: pointer;
    min-width: 0;
    max-width: 100%;
}

.mv-advanced-mobile-card__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
}

.mv-advanced-mobile-card__title {
    font-weight: 800;
    font-size: 14px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.mv-advanced-mobile-card__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
}

.mv-advanced-mobile-card__field {
    min-width: 0;
}

.mv-advanced-mobile-card__label {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 0.04em;
}

.mv-advanced-mobile-card__value {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 700;
    overflow-wrap: anywhere;
}
</style>
