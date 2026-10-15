import type { Component } from 'vue';
import MvColumnFilterText from './MvColumnFilterText.vue';
import MvColumnFilterSelect from './MvColumnFilterSelect.vue';
import MvColumnFilterBoolean from './MvColumnFilterBoolean.vue';
import MvColumnFilterStatus from './MvColumnFilterStatus.vue';
import MvColumnFilterEnum from './MvColumnFilterEnum.vue';
import MvColumnFilterDate from './MvColumnFilterDate.vue';
import MvColumnFilterDateRange from './MvColumnFilterDateRange.vue';
import MvColumnFilterAmountRange from './MvColumnFilterAmountRange.vue';
import type { ColumnFilterType } from './columnFilterTypes';

// custom (slot-rendered by the table) and none (never filters) are left out of the mapped type.
// A new standard filterType missing here is a TS error, not a silent fallback to a generic filter.
export const COLUMN_FILTER_REGISTRY: Record<
    Exclude<ColumnFilterType, 'custom' | 'none'>,
    Component
> = {
    text: MvColumnFilterText,
    select: MvColumnFilterSelect,
    boolean: MvColumnFilterBoolean,
    status: MvColumnFilterStatus,
    enum: MvColumnFilterEnum,
    'single-date': MvColumnFilterDate,
    'date-range': MvColumnFilterDateRange,
    'amount-range': MvColumnFilterAmountRange,
};

export function resolveColumnFilterComponent(type: ColumnFilterType): Component | undefined {
    if (type === 'custom' || type === 'none') return undefined;
    return COLUMN_FILTER_REGISTRY[type];
}
