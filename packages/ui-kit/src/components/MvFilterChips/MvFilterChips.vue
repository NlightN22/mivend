<script setup lang="ts">
import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Quick-filter chip row — reused across manager portal pages (Dashboard, Orders, Discounts,
// Invoices) wherever a saved/quick filter selector sits above a table, below the main filter
// widget.
//
// `variant` is optional and colors the chip using the same palette as MvStatusBadge (see below)
// — pass it whenever a chip represents the same status/state that's also shown as a colored row
// badge in the table underneath (e.g. an Orders "Unpaid"/"Partially paid"/"Cancelled" quick
// filter next to a Payment/Commercial-state column), reusing that column's own *_BADGE_VARIANT
// map (api/orders.ts's ORDER_STATE_BADGE_VARIANT, api/invoices.ts's INVOICE_STATUS_BADGE_VARIANT,
// etc.) as the single source of truth — never a second, independent color choice for the chip.
// A variant chip carries its color *at rest*, like the badge it mirrors — selection is shown by
// deepening that same color (darker background/border), not by switching to an unrelated color.
// This lets a user recognize "this chip = that badge color" before ever clicking anything, and
// matches an already-selected chip to its badge at a glance instead of requiring them to read the
// label. Real incident this fixes: CustomerOrdersTab.vue/CustomerInvoicesTab.vue each had their
// own bespoke `__view-chip` button + scoped CSS (itself a "never style a UI element inside a page component" violation of the
// frontend-rules skill) that was plain white/gray at rest and only ever went green
// on selection regardless of what the chip meant, so nothing about a chip's own color hinted at
// its meaning, and "Unpaid" vs. "Cancelled" only differed by their text. Omit `variant` (or leave
// it undefined) for a chip with no corresponding status color (e.g. "All") — it keeps the
// original neutral-at-rest / green-when-selected look.
export interface FilterChip {
    key: string;
    label: string;
    variant?: StatusBadgeVariant;
}

defineProps<{ chips: FilterChip[]; active: string }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div class="mv-filter-chips">
        <button
            v-for="chip in chips"
            :key="chip.key"
            type="button"
            class="mv-filter-chip"
            :class="[
                chip.variant ? `mv-filter-chip--${chip.variant}` : '',
                chip.key === active ? (chip.variant ? 'mv-filter-chip--selected' : 'mv-filter-chip--active') : '',
            ]"
            @click="emit('select', chip.key)"
        >
            {{ chip.label }}
        </button>
    </div>
</template>

<style scoped>
.mv-filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    /* No margin here on purpose — this component is used both standalone (needs page-level
       spacing below it, e.g. DiscountsPage.vue/DashboardPage.vue) and inline inside a table
       toolbar's align-items:center row next to the search box (e.g. CustomerOrdersTab.vue via
       the #view-chips slot). A one-sided margin-bottom baked in here shifted the flex item's
       margin box, which pushed its *content* visibly upward relative to sibling toolbar items
       under align-items:center — a real regression caught after MvFilterChips started being
       used inline. Layout/spacing between blocks belongs at the page/feature level per the
       frontend-rules skill's ui-kit rules — add it at the call site instead of here. */
}

.mv-filter-chip {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 999px;
    background: #fff;
    color: var(--el-text-color-regular, #374151);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
}

.mv-filter-chip:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.mv-filter-chip--active {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
    border-color: var(--el-color-primary-light-7, #c8f7ec);
}

/* Higher specificity than .mv-filter-chip:hover (two classes vs one class + pseudo-class) so
   hovering an already-active chip stays in its active appearance instead of falling back to
   the plain hover background. */
.mv-filter-chip--active:hover {
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
    border-color: var(--el-color-primary-light-7, #c8f7ec);
}

/* Same palette as MvStatusBadge's variants, at rest (unselected) — kept in sync by hand (no
   shared CSS module between the two components exists yet); if a third color-coded chip/badge
   component appears, extract this into a shared source instead of a third hand-copy. */
.mv-filter-chip--neutral {
    background: #f1f5f9;
    color: #475569;
    border-color: #f1f5f9;
}

.mv-filter-chip--success {
    background: #d1fae5;
    color: #065f46;
    border-color: #d1fae5;
}

.mv-filter-chip--warning {
    background: #fef3c7;
    color: #92400e;
    border-color: #fef3c7;
}

.mv-filter-chip--danger {
    background: #fee2e2;
    color: #991b1b;
    border-color: #fee2e2;
}

.mv-filter-chip--info {
    background: #e0f2fe;
    color: #0c4a6e;
    border-color: #e0f2fe;
}

/* Selection deepens the same variant color (darker background + a matching border) instead of
   switching to an unrelated color — see this file's own doc comment on `variant` for why. The
   bolder weight gives a second, color-independent cue that a chip is selected. */
.mv-filter-chip--selected {
    font-weight: 800;
}

.mv-filter-chip--neutral.mv-filter-chip--selected,
.mv-filter-chip--neutral.mv-filter-chip--selected:hover {
    background: #e2e8f0;
    color: #334155;
    border-color: #94a3b8;
}

.mv-filter-chip--success.mv-filter-chip--selected,
.mv-filter-chip--success.mv-filter-chip--selected:hover {
    background: #a7f3d0;
    color: #065f46;
    border-color: #34d399;
}

.mv-filter-chip--warning.mv-filter-chip--selected,
.mv-filter-chip--warning.mv-filter-chip--selected:hover {
    background: #fde68a;
    color: #78350f;
    border-color: #f59e0b;
}

.mv-filter-chip--danger.mv-filter-chip--selected,
.mv-filter-chip--danger.mv-filter-chip--selected:hover {
    background: #fecaca;
    color: #7f1d1d;
    border-color: #f87171;
}

.mv-filter-chip--info.mv-filter-chip--selected,
.mv-filter-chip--info.mv-filter-chip--selected:hover {
    background: #bae6fd;
    color: #0c4a6e;
    border-color: #38bdf8;
}
</style>
