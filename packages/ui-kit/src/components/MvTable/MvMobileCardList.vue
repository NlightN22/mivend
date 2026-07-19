<script setup lang="ts">
import { computed, type VNode } from 'vue';
import type { Column } from 'element-plus';
import type { TableRow } from './MvTable.vue';

// Column objects passed in may carry this extra `mobile` metadata alongside the normal
// element-plus Column fields (Column<T> has a `[key: string]: any` index signature, so this
// is structurally valid without a wrapper type).
export interface MvMobileColumnMeta {
    primary?: boolean;
    badge?: boolean;
    actions?: boolean;
    highlight?: boolean;
    hidden?: boolean;
}

export type MvMobileColumn = Column<TableRow> & { mobile?: MvMobileColumnMeta };

const props = defineProps<{
    columns: MvMobileColumn[];
    data: TableRow[];
    emptyText?: string;
}>();

const emit = defineEmits<{ 'row-click': [payload: { rowData: TableRow }] }>();

const primaryColumn = computed(() => props.columns.find(c => c.mobile?.primary));
const badgeColumn = computed(() => props.columns.find(c => c.mobile?.badge));
const highlightColumn = computed(() => props.columns.find(c => c.mobile?.highlight));
const actionsColumn = computed(() => props.columns.find(c => c.mobile?.actions));
const fieldColumns = computed(() =>
    props.columns.filter(
        c => !c.mobile?.hidden && !c.mobile?.primary && !c.mobile?.badge && !c.mobile?.actions && !c.mobile?.highlight,
    ),
);

function renderCell(column: Column<TableRow>, rowData: TableRow, rowIndex: number): VNode | string {
    const cellData = column.dataKey ? rowData[column.dataKey as string] : undefined;
    if (column.cellRenderer) {
        return column.cellRenderer({
            cellData: cellData as TableRow,
            rowData,
            rowIndex,
            column,
            columns: props.columns,
            columnIndex: 0,
        });
    }
    return String(cellData ?? '—');
}

const VNodeHost = (renderProps: { render: () => VNode | string }): VNode | string => renderProps.render();
</script>

<template>
    <div class="mv-mobile-cards">
        <p v-if="!data.length" class="mv-mobile-cards__empty">{{ emptyText ?? 'No data' }}</p>
        <article
            v-for="(row, rowIndex) in data"
            :key="rowIndex"
            class="mv-mobile-card"
            @click="emit('row-click', { rowData: row })"
        >
            <div class="mv-mobile-card__head">
                <div class="mv-mobile-card__title">
                    <VNodeHost v-if="primaryColumn" :render="() => renderCell(primaryColumn!, row, rowIndex)" />
                </div>
                <div v-if="badgeColumn" class="mv-mobile-card__badge">
                    <VNodeHost :render="() => renderCell(badgeColumn!, row, rowIndex)" />
                </div>
            </div>

            <div v-if="highlightColumn && renderCell(highlightColumn, row, rowIndex)" class="mv-mobile-card__highlight">
                <VNodeHost :render="() => renderCell(highlightColumn!, row, rowIndex)" />
            </div>

            <div class="mv-mobile-card__grid">
                <div v-for="col in fieldColumns" :key="String(col.key)" class="mv-mobile-card__field">
                    <div class="mv-mobile-card__label">{{ col.title }}</div>
                    <div class="mv-mobile-card__value">
                        <VNodeHost :render="() => renderCell(col, row, rowIndex)" />
                    </div>
                </div>
            </div>

            <div v-if="actionsColumn" class="mv-mobile-card__actions" @click.stop>
                <VNodeHost :render="() => renderCell(actionsColumn!, row, rowIndex)" />
            </div>
        </article>
    </div>
</template>

<style scoped>
.mv-mobile-cards {
    display: grid;
    gap: 12px;
    /* A border + shadow alone weren't enough real separation on an actual phone screen (real
       incident: cards read as one continuous block when the border sits flush against the
       panel's own white background — a 1-3px shadow at this scale is nearly invisible on a
       real display, not just in a zoomed-in screenshot). A visibly tinted page background
       behind white cards is the standard mobile list pattern (iOS grouped lists, Material
       list) — contrast that actually survives a real screen, not just border color tuning. */
    background: var(--el-fill-color-light, #f1f4f7);
    padding: 10px;
    /* No border-radius of its own — this fills MvTable's outer wrapper (.mv-table), which
       already clips to its own 12px radius via overflow:hidden. */
}

.mv-mobile-cards__empty {
    padding: 24px;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 14px;
}

.mv-mobile-card {
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

.mv-mobile-card__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
}

.mv-mobile-card__title {
    font-weight: 800;
    font-size: 14px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.mv-mobile-card__highlight {
    background: var(--el-fill-color-light, #f8fafc);
    border-radius: 9px;
    padding: 9px 10px;
    font-size: 12px;
}

.mv-mobile-card__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
}

.mv-mobile-card__field {
    min-width: 0;
}

.mv-mobile-card__label {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 0.04em;
}

.mv-mobile-card__value {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 700;
    overflow-wrap: anywhere;
}

.mv-mobile-card__actions {
    display: grid;
}
</style>
