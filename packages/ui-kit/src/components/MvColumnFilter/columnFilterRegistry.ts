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

// `custom` is slot-rendered by the consuming table (its whole point is to not go through this
// registry) and `none` never renders a filter at all — both are deliberately excluded from the
// mapped type below, so adding a new standard filterType to ColumnFilterType without adding it
// here is a TypeScript error (a missing key on a mapped type over a union), not a silent runtime
// fallback to some generic/default filter (see AGENTS.md "no implicit universal filter" — this
// is the mechanism that guarantees it).
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
