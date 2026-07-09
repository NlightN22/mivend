<script setup lang="ts">
import { computed } from 'vue';
import { ElTableV2, ElAutoResizer } from 'element-plus';
import type { Column } from 'element-plus';

export type RowState =
  | 'default'
  | 'hover'
  | 'in-stock'
  | 'low-stock'
  | 'by-order'
  | 'in-cart'
  | 'reserved'
  | 'unavailable'
  | 'analog';

export interface TableRow {
  [key: string]: unknown;
  _rowState?: RowState;
}

interface Props {
  columns: Column<TableRow>[];
  data: TableRow[];
  loading?: boolean;
  rowHeight?: number;
  height?: number;
  emptyText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  rowHeight: 52,
  height: 400,
  emptyText: 'No data',
});

function rowClass({ rowData }: { rowData: TableRow }): string {
  return rowData._rowState ? `mv-table-row--${rowData._rowState}` : '';
}

const fixedHeight = computed(() => props.height);

const emit = defineEmits<{ 'row-click': [payload: { rowData: TableRow }] }>();
</script>

<template>
  <div class="mv-table" :class="{ 'mv-table--loading': loading }">
    <div v-if="loading" class="mv-table__loader">
      <span class="mv-table__spinner" />
    </div>

    <ElAutoResizer>
      <template #default="{ width }">
        <ElTableV2
          :columns="columns"
          :data="data"
          :width="width"
          :height="fixedHeight"
          :row-height="rowHeight"
          :row-class="rowClass"
          @row-click="({ rowData }) => emit('row-click', { rowData: rowData as TableRow })"
        >
          <template v-if="!data.length && !loading" #empty>
            <div class="mv-table__empty">{{ emptyText }}</div>
          </template>
        </ElTableV2>
      </template>
    </ElAutoResizer>
  </div>
</template>

<style>
.mv-table {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #E4E7EC;
}

.mv-table--loading { opacity: 0.6; pointer-events: none; }

.mv-table__loader {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 10;
}

.mv-table__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #E4E7EC;
  border-top-color: #00B894;
  border-radius: 50%;
  animation: mv-table-spin 0.7s linear infinite;
}

@keyframes mv-table-spin { to { transform: rotate(360deg); } }

.mv-table__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  font-size: 14px;
  color: #667085;
}

/* Header */
.el-table-v2__header-row {
  background: #F8FAFC !important;
}
.el-table-v2__header-cell {
  font-size: 12px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  color: #667085 !important;
}

/* Row states */
.mv-table-row--in-stock .el-table-v2__row-cell { color: #065F46; }
.mv-table-row--low-stock { background: #FFFBEB !important; }
.mv-table-row--low-stock .el-table-v2__row-cell { color: #92400E; }
.mv-table-row--by-order { background: #F0F9FF !important; }
.mv-table-row--in-cart { background: #FFF8F0 !important; }
.mv-table-row--reserved { background: #F5F3FF !important; }
.mv-table-row--unavailable { opacity: 0.55; }
.mv-table-row--analog { background: #FAF5FF !important; }

/* Row hover */
.el-table-v2__row:hover .el-table-v2__row-cell { background: #F0FFFA !important; }
</style>
