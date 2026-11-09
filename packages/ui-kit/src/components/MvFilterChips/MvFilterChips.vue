<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';
import { formatCompactCount, formatExactCount } from '../../utils/compactCount';
import { shouldCollapseChips } from './chipOverflow';
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
    // Server COUNT for the chip; shown as a pill after the label.
    count?: number;
    // Shows a placeholder of the pill's width instead of the count while it is being fetched.
    countLoading?: boolean;
    // Inverts the count pill while count > 0, for the chip people look at first.
    emphasis?: boolean;
}

// More than `maxInline` chips collapse into one horizontally scrolling row with a fade edge.
const props = withDefaults(
    defineProps<{
        chips: FilterChip[];
        active: string;
        scrollable?: boolean;
        maxInline?: number;
    }>(),
    { scrollable: false, maxInline: 6 },
);
const collapsed = computed(() => shouldCollapseChips(props.chips.length, props.maxInline));

const row = ref<HTMLElement | null>(null);
const canPrev = ref(false);
const canNext = ref(false);
function measure(): void {
    const el = row.value;
    if (!el) return;
    canPrev.value = el.scrollLeft > 1;
    canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}
function step(direction: 1 | -1): void {
    row.value?.scrollBy({ left: direction * (row.value.clientWidth * 0.7), behavior: 'smooth' });
}
function revealActive(): void {
    const el = row.value;
    const chip = el?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || !chip) return;
    if (
        chip.offsetLeft < el.scrollLeft ||
        chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth
    )
        el.scrollLeft = Math.max(0, chip.offsetLeft - 24);
}
let observer: ResizeObserver | undefined;
onMounted(() => {
    measure();
    revealActive();
    if (typeof ResizeObserver !== 'undefined' && row.value) {
        observer = new ResizeObserver(measure);
        observer.observe(row.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());
watch(
    () => [props.active, props.chips.length],
    async () => {
        await nextTick();
        revealActive();
        measure();
    },
);
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div class="mv-filter-chips-wrap">
        <button
            v-if="collapsed && canPrev"
            type="button"
            class="mv-filter-chips__arrow"
            aria-label="Scroll chips left"
            @click="step(-1)"
        >
            ‹
        </button>
        <div
            ref="row"
            class="mv-filter-chips"
            :class="{
                'mv-filter-chips--scrollable': scrollable,
                'mv-filter-chips--collapsed': collapsed,
                'mv-filter-chips--fade-start': collapsed && canPrev,
                'mv-filter-chips--fade-end': collapsed && canNext,
            }"
            @scroll.passive="measure"
        >
            <button
                v-for="chip in chips"
                :key="chip.key"
                type="button"
                class="mv-filter-chip"
                :data-active="chip.key === active"
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
                <span class="mv-filter-chip__label" :title="chip.label">{{ chip.label }}</span>
                <span
                    v-if="chip.countLoading"
                    class="mv-filter-chip__count-skeleton"
                    role="status"
                    aria-label="Loading"
                    data-testid="chip-count-skeleton"
                    ><MvSkeleton width="28px" height="17px" radius="999px" aria-hidden="true"
                /></span>
                <span
                    v-else-if="chip.count !== undefined"
                    class="mv-filter-chip__count"
                    :class="{ 'mv-filter-chip__count--emphasis': chip.emphasis && chip.count > 0 }"
                    :title="formatExactCount(chip.count)"
                    >{{ formatCompactCount(chip.count) }}</span
                >
            </button>
        </div>
        <button
            v-if="collapsed && canNext"
            type="button"
            class="mv-filter-chips__arrow"
            aria-label="Scroll chips right"
            @click="step(1)"
        >
            ›
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
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    max-width: 260px;
}

.mv-filter-chip__label {
    overflow: hidden;
    text-overflow: ellipsis;
}

.mv-filter-chip__count {
    margin-left: 6px;
    padding: 1px 7px;
    min-width: 28px;
    flex: none;
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
    text-align: center;
    border-radius: 999px;
    background: var(--app-fill-soft);
    color: inherit;
    font-size: 11px;
}

.mv-filter-chip__count-skeleton {
    display: inline-block;
    margin-left: 6px;
    vertical-align: middle;
}

.mv-filter-chip__count--emphasis {
    background: var(--app-warn-fg);
    color: var(--app-warn-bg);
}

.mv-filter-chips-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 100%;
    min-width: 0;
}

.mv-filter-chips--collapsed {
    --mv-fade-start: 0px;
    --mv-fade-end: 0px;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    overflow-x: auto;
    min-width: 0;
    padding-inline: 16px;
    scrollbar-width: none;
    mask-image: linear-gradient(
        to right,
        transparent,
        var(--mv-fade-mask-solid) var(--mv-fade-start),
        var(--mv-fade-mask-solid) calc(100% - var(--mv-fade-end)),
        transparent
    );
}

.mv-filter-chips--fade-start {
    --mv-fade-start: 16px;
}

.mv-filter-chips--fade-end {
    --mv-fade-end: 16px;
}

.mv-filter-chips__arrow {
    flex: none;
    width: 28px;
    height: 28px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--app-surface);
    color: var(--el-text-color-regular);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
}

.mv-filter-chips__arrow:hover {
    background: var(--el-fill-color-light);
}

.mv-filter-chips--collapsed .mv-filter-chip {
    flex: none;
}

/* Wraps on desktop; on a phone the row scrolls sideways instead of growing tall. */
@media (max-width: 800px) {
    .mv-filter-chips--scrollable {
        flex-wrap: nowrap;
        overflow-x: auto;
        max-width: 100%;
        scrollbar-width: none;
    }

    .mv-filter-chips--scrollable .mv-filter-chip {
        flex: none;
    }
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
