<script setup lang="ts">
import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Quick-filter chip row — reused across manager portal pages (Dashboard, Orders, Discounts,
// ProformaInvoices) wherever a saved/quick filter selector sits above a table, below the main filter
// widget.
//
// `variant` is optional and colors the chip using the same palette as MvStatusBadge (see below)
// — pass it whenever a chip represents the same status/state that's also shown as a colored row
// badge in the table underneath (e.g. an Orders "Unpaid"/"Partially paid"/"Cancelled" quick
// filter next to a Payment/Commercial-state column), reusing that column's own *_BADGE_VARIANT
// map (api/orders.ts's ORDER_STATE_BADGE_VARIANT, api/proforma-invoices.ts's PROFORMA_INVOICE_STATUS_BADGE_VARIANT,
// etc.) as the single source of truth — never a second, independent color choice for the chip.
// A variant chip carries its color *at rest*, like the badge it mirrors — selection is shown by
// deepening that same color (darker background/border), not by switching to an unrelated color.
// This lets a user recognize "this chip = that badge color" before ever clicking anything, and
// matches an already-selected chip to its badge at a glance instead of requiring them to read the
// label. Real incident this fixes: CustomerOrdersTab.vue/CustomerProformaInvoicesTab.vue each had their
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
                chip.key === active
                    ? chip.variant
                        ? 'mv-filter-chip--selected'
                        : 'mv-filter-chip--active'
                    : '',
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
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--app-surface);
    color: var(--el-text-color-regular);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
}

.mv-filter-chip:hover {
    background: var(--el-fill-color-light);
}

.mv-filter-chip--active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary-dark-2);
    border-color: var(--el-color-primary-light-7);
}

/* Higher specificity than .mv-filter-chip:hover (two classes vs one class + pseudo-class) so
   hovering an already-active chip stays in its active appearance instead of falling back to
   the plain hover background. */
.mv-filter-chip--active:hover {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary-dark-2);
    border-color: var(--el-color-primary-light-7);
}

/* Same palette as MvStatusBadge's variants, at rest (unselected) — kept in sync by hand (no
   shared CSS module between the two components exists yet); if a third color-coded chip/badge
   component appears, extract this into a shared source instead of a third hand-copy. */
.mv-filter-chip--neutral {
    background: var(--app-slate-bg);
    color: var(--app-text-grey);
    border-color: var(--app-slate-bg);
}

.mv-filter-chip--success {
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
    border-color: var(--app-ok-bg);
}

.mv-filter-chip--warning {
    background: var(--app-warn-bg);
    color: var(--app-warn-fg);
    border-color: var(--app-warn-bg);
}

.mv-filter-chip--danger {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
    border-color: var(--app-danger-bg);
}

.mv-filter-chip--info {
    background: var(--app-info-bg);
    color: var(--app-info-fg);
    border-color: var(--app-info-bg);
}

/* Selection deepens the same variant color (darker background + a matching border) instead of
   switching to an unrelated color — see this file's own doc comment on `variant` for why. The
   bolder weight gives a second, color-independent cue that a chip is selected. */
.mv-filter-chip--selected {
    font-weight: 800;
}

.mv-filter-chip--neutral.mv-filter-chip--selected,
.mv-filter-chip--neutral.mv-filter-chip--selected:hover {
    background: var(--app-sel-neutral-bg);
    color: var(--app-sel-neutral-fg);
    border-color: var(--app-sel-neutral-bd);
}

.mv-filter-chip--success.mv-filter-chip--selected,
.mv-filter-chip--success.mv-filter-chip--selected:hover {
    background: var(--app-sel-ok-bg);
    color: var(--app-ok-fg);
    border-color: var(--app-sel-ok-bd);
}

.mv-filter-chip--warning.mv-filter-chip--selected,
.mv-filter-chip--warning.mv-filter-chip--selected:hover {
    background: var(--app-sel-warn-bg);
    color: var(--app-sel-warn-fg);
    border-color: var(--app-sel-warn-bd);
}

.mv-filter-chip--danger.mv-filter-chip--selected,
.mv-filter-chip--danger.mv-filter-chip--selected:hover {
    background: var(--app-sel-danger-bg);
    color: var(--app-danger2-fg);
    border-color: var(--app-sel-danger-bd);
}

.mv-filter-chip--info.mv-filter-chip--selected,
.mv-filter-chip--info.mv-filter-chip--selected:hover {
    background: var(--app-sel-info-bg);
    color: var(--app-info-fg);
    border-color: var(--app-sel-info-bd);
}
</style>
