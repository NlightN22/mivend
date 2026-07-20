<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import DataTable, { type DataTableFilterMeta } from 'primevue/datatable';
import Column from 'primevue/column';
import { Setting, Sort, SortUp, SortDown, Rank } from '@element-plus/icons-vue';
import {
    MvStatusBadge,
    MvColumnToggle,
    MvActiveFilterChips,
    MvColumnFilterStatus,
    useDataTableState,
    resolveColumnFilterComponent,
    DATE_RANGE_PRESETS,
    type StatusBadgeVariant,
    type ColumnFilterConfig,
    type StatusFilterConfig,
    type AmountRangeFilterValue,
    type DateRangeFilterValue,
    type ActiveFilterChip,
    type DataTableSortMeta,
} from '@mivend/ui-kit';
import type { TableRow } from '@mivend/ui-kit';
import {
    ORDER_STATE_OPTIONS,
    ORDER_STATE_BADGE_VARIANT,
    ORDER_RESERVATION_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_BADGE_VARIANT,
    FULFILLMENT_STATE_OPTIONS,
    FULFILLMENT_STATE_BADGE_VARIANT,
    type OrderSortField,
    type ManagerOption,
} from '../../api/orders';
import { PLACED_BY_CUSTOMER_VALUE, type CustomerOrdersView } from '../../api/customers';

// Desktop-only PrimeVue table for the customer detail Orders tab — mobile keeps
// CustomerOrdersTab.vue's own MvTable-based card rendering (see its `isMobile` branch). Row
// shaping (fulfillment/payment/placedBy labels) stays in CustomerOrdersTab.vue so it's computed
// once and shared between both branches, not duplicated here.
//
// Every filterable column declares a typed `filterConfig` (see @mivend/ui-kit's
// columnFilterTypes.ts) — the table resolves the matching editor component via
// resolveColumnFilterComponent() instead of hand-building a popover/input/select per column (see
// AGENTS.md's manager-portal rules). 'payment' is the one sanctioned `custom` exception: it
// doesn't filter through the generic OrderFilterParameter route at all — it's wired to the same
// paymentView the chips above the table already use (a purpose-built server-side subquery
// against plugin-acquiring's PaymentAttempt — see AdminOrderPaymentViewResolver), not a second,
// redundant mechanism, so it renders its own bespoke content instead of going through the
// registry. 'items' is the one column with no meaningful filter (`type: 'none'`).
const props = defineProps<{
    rows: TableRow[];
    loading: boolean;
    totalItems: number;
    pageSize: number;
    managers: ManagerOption[];
    stateFilter: string[];
    reservationStateFilter: string;
    dateRangeFilter: DateRangeFilterValue;
    codeFilter: string;
    fulfillmentStateFilter: string[];
    placedByFilter: string;
    totalMinFilter: number | undefined;
    totalMaxFilter: number | undefined;
    administratorId: string;
    // The same view the chips above the table set (all/unpaid/partial/cancelled) — kept in sync
    // here so clicking a chip is reflected in the Payment column's own funnel filter too, not
    // just the other way around.
    paymentViewProp: CustomerOrdersView;
}>();

interface FilterValues {
    state: string[];
    reservationState: string;
    dateRange: DateRangeFilterValue;
    code: string;
    fulfillmentState: string[];
    placedByAdministratorId: string;
    totalMin: number | undefined;
    totalMax: number | undefined;
}

const emit = defineEmits<{
    'update:sort': [sort: Partial<Record<OrderSortField, 'ASC' | 'DESC'>>];
    'update:filters': [filters: FilterValues];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'update:payment-view': [view: CustomerOrdersView];
}>();

const router = useRouter();

interface ColumnDef {
    field: string;
    header: string;
    sortField?: OrderSortField;
    width: number;
    required?: boolean;
    filterConfig: ColumnFilterConfig;
}

const NON_BLANK_STATE_OPTIONS = ORDER_STATE_OPTIONS.filter(o => o.value);
const NON_BLANK_RESERVATION_OPTIONS = ORDER_RESERVATION_STATE_OPTIONS.filter(o => o.value);

const ALL_COLUMNS: ColumnDef[] = [
    {
        field: 'code',
        header: 'Order #',
        sortField: 'code',
        width: 170,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Order number contains…' },
    },
    {
        field: 'state',
        header: 'Commercial state',
        sortField: 'state',
        width: 160,
        filterConfig: {
            type: 'status',
            multiple: true,
            placeholder: 'All commercial states',
            options: NON_BLANK_STATE_OPTIONS.map(o => ({ ...o, variant: ORDER_STATE_BADGE_VARIANT[o.value] ?? 'neutral' })),
        },
    },
    {
        field: 'fulfillment',
        header: 'Fulfillment',
        width: 160,
        filterConfig: {
            type: 'status',
            multiple: true,
            placeholder: 'All fulfillment states',
            options: FULFILLMENT_STATE_OPTIONS.map(o => ({ ...o, variant: FULFILLMENT_STATE_BADGE_VARIANT[o.value] ?? 'neutral' })),
        },
    },
    { field: 'payment', header: 'Payment', width: 130, filterConfig: { type: 'custom' } },
    { field: 'items', header: 'Items', width: 90, filterConfig: { type: 'none' } },
    {
        field: 'total',
        header: 'Total',
        sortField: 'totalWithTax',
        width: 130,
        // currencyCode is a placeholder here — the real value (derived from the actual order
        // data) is spliced in per-render by resolveConfig(), since ALL_COLUMNS itself is a plain,
        // non-reactive array (seeded once into useDataTableState's defaults).
        filterConfig: { type: 'amount-range', currencyCode: 'USD' },
    },
    {
        field: 'date',
        header: 'Date created',
        sortField: 'createdAt',
        width: 140,
        filterConfig: { type: 'date-range' },
    },
    {
        field: 'placedBy',
        header: 'Placed by',
        width: 170,
        // options placeholder — real list (from props.managers) spliced in by resolveConfig().
        filterConfig: { type: 'enum', placeholder: 'Anyone', options: [] },
    },
    {
        field: 'reservationState',
        header: 'Reservation',
        width: 160,
        // A real column with its own funnel like every other filterable field — this used to be
        // an orphaned filter (a button with no corresponding column showing the data it
        // filtered), which made no sense once every other filter got its own column.
        filterConfig: {
            type: 'status',
            placeholder: 'Any reservation state',
            options: NON_BLANK_RESERVATION_OPTIONS.map(o => ({ ...o, variant: ORDER_RESERVATION_STATE_BADGE_VARIANT[o.value] ?? 'neutral' })),
        },
    },
];

// The toolbar's own universal search input targets this — not a second, hand-typed reference to
// ALL_COLUMNS[0] (fragile, breaks silently if column order ever changes).
const CODE_COLUMN = ALL_COLUMNS.find(c => c.field === 'code')!;

const currencyCode = computed(() => (props.rows[0]?.currencyCode as string | undefined) ?? 'USD');
// Only needed here for the "Active filters" chip's amount-range summary text (e.g. "$500–$1,000")
// — MvColumnFilterAmountRange derives its own symbol internally for its own UI, this is a
// separate, smaller use of the same real ISO-code -> symbol lookup (see AGENTS.md: never
// hardcode a currency symbol).
const currencySymbol = computed(() => {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode.value }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? currencyCode.value;
});
// A customer can place their own order directly via the storefront (see the "Ivan Petrov
// (customer)" rows placedByLabel() produces) — the manager list alone can't express that value,
// same gap Fulfillment's 'Not started' fills for a null customField. PLACED_BY_CUSTOMER_VALUE is
// the shared sentinel both this options list and fetchOrdersPageForCustomer's `isNull` mapping
// agree on (see api/customers.ts).
const placedByOptions = computed(() => [
    { value: PLACED_BY_CUSTOMER_VALUE, label: 'Customer (self)' },
    ...props.managers.map(m => ({ value: m.id, label: m.name })),
]);
// Colors match how these same states already render elsewhere: the body cell's own payment
// badge (Unpaid=neutral, Partially paid=warning — see CustomerOrdersTab.vue's
// PAYMENT_BADGE_VARIANT) and Cancelled's order-state badge (danger — see
// ORDER_STATE_BADGE_VARIANT in api/orders.ts). The plain native <select> this replaced showed
// these as unstyled text, inconsistent with every other status-shaped filter (Commercial
// state/Fulfillment/Reservation) which already use MvColumnFilterStatus's colored-badge list.
const PAYMENT_FILTER_CONFIG: StatusFilterConfig = {
    type: 'status',
    placeholder: 'Search payment view…',
    options: [
        { value: 'unpaid', label: 'Unpaid', variant: 'neutral' },
        { value: 'partial', label: 'Partially paid', variant: 'warning' },
        { value: 'cancelled', label: 'Cancelled', variant: 'danger' },
    ],
};

// Splices in the two bits of config that depend on live data (currency, manager list) rather than
// static declaration — see ALL_COLUMNS' doc comments on the 'total'/'placedBy' entries above.
function resolveConfig(col: ColumnDef): ColumnFilterConfig {
    if (col.field === 'total' && col.filterConfig.type === 'amount-range') {
        return { ...col.filterConfig, currencyCode: currencyCode.value };
    }
    if (col.field === 'placedBy' && col.filterConfig.type === 'enum') {
        return { ...col.filterConfig, options: placedByOptions.value };
    }
    return col.filterConfig;
}

// Fits the table's own scroll area to exactly the selected page size (10/20/50 rows) instead of
// a fixed viewport-relative height — a fixed 70vh either wasted space (small page size) or
// clipped rows (large page size) regardless of how many rows are actually on screen. Header
// height + one row height per data row, matching this table's own row/header CSS.
const ROW_HEIGHT_PX = 56;
const HEADER_HEIGHT_PX = 54;
const dynamicScrollHeight = computed(() => `${props.pageSize * ROW_HEIGHT_PX + HEADER_HEIGHT_PX}px`);

function toMinorUnits(value: number | undefined): number | undefined {
    return value === undefined ? undefined : Math.round(value * 100);
}
function toMajorUnits(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value / 100;
}

// The normalized filter state — every field's committed value, independent of whichever UI
// widget edits it (see @mivend/ui-kit's ColumnFilterValueMap). This is now the single source of
// truth: no more parallel local refs per field. Restored/saved/reset through the same
// useDataTableState mechanism as column order/width/visibility/sort/pageSize (see below) —
// filters persist across sessions the same way the rest of this table's layout already does.
interface CustomerOrdersFilterState {
    [key: string]: unknown;
    code: string;
    state: string[];
    fulfillment: string[];
    date: DateRangeFilterValue;
    placedBy: string;
    reservationState: string;
    total: AmountRangeFilterValue;
}
const DEFAULT_FILTERS: CustomerOrdersFilterState = {
    code: props.codeFilter,
    state: props.stateFilter,
    fulfillment: props.fulfillmentStateFilter,
    date: props.dateRangeFilter,
    placedBy: props.placedByFilter,
    reservationState: props.reservationStateFilter,
    total: { mode: 'range', min: toMajorUnits(props.totalMinFilter), max: toMajorUnits(props.totalMaxFilter) },
};

// The `-v2` suffix is a deliberate storage-key bump, not decoration — useDataTableState restores
// whatever was persisted wholesale, with no merge/shape-check against current defaults. Real,
// repeated incident this fixes: this component's filter *shapes* changed more than once
// (`total` gained a real object shape; `state`/`fulfillment` went from a single string to
// string[] for multi-select; `date` went from a bare ISO string to a {preset,from,to} object) —
// each time, a browser with an older persisted blob got a field of the wrong runtime shape (a
// string where an object/array was expected), which either crashed (`f.total.min` on undefined)
// or silently misbehaved (a raw string sent where the API expects a string[], a date-range
// component fed a string instead of {preset,from,to}). Patching each field's shape defensively
// after load worked but doesn't scale — every future shape change would need its own new check.
// Bumping the key instead makes old-shaped data simply not match at all, falling back cleanly to
// DEFAULT_FILTERS — this is personal per-admin UI state (AGENTS.md), not data anyone needs
// preserved across a version bump, so losing an old filter selection here costs nothing.
const { state: tableState } = useDataTableState<CustomerOrdersFilterState>(
    `customer-orders-datatable-v2:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [{ field: 'date', order: -1 as const }],
        filters: DEFAULT_FILTERS,
        pageSize: props.pageSize,
    },
);

// The server request is built purely from this normalized state, never from any UI component's
// own internal state (see AGENTS.md's requirement) — amount-range's min/max here are already
// mode-resolved gte/lte-ready bounds (MvColumnFilterAmountRange does that math on Apply), so this
// is just a straight field-by-field mapping plus the minor-currency-unit conversion.
function emitCurrentFilters(): void {
    const f = tableState.value.filters;
    emit('update:filters', {
        state: f.state,
        reservationState: f.reservationState,
        dateRange: f.date,
        code: f.code,
        fulfillmentState: f.fulfillment,
        placedByAdministratorId: f.placedBy,
        totalMin: toMinorUnits(f.total.min),
        totalMax: toMinorUnits(f.total.max),
    });
}
// Restores a filter set persisted from a previous session (useDataTableState reads localStorage
// before this component's own defaults ever apply) into the parent's fetch — otherwise the
// parent's own filter refs stay at their fresh-mount '' defaults until the user touches a filter
// again, silently ignoring whatever was restored here.
onMounted(() => emitCurrentFilters());

// PrimeVue's own column-filter overlay has no exposed handle to close it from a fully custom
// `#filter` template (its open/close state is internal to the ColumnFilter it wraps) — dispatching
// a click on <body> triggers the overlay's own outside-click listener, closing it the same way
// clicking elsewhere on the page already does. A pragmatic, contained workaround, only used where
// the filter type below calls for auto-closing after a single-value pick.
// Best-effort: dispatches a synthetic click on <body>, which triggers PrimeVue's own
// outside-click listener the same way a real click elsewhere on the page would, closing the
// overlay. Confirmed live that this doesn't reliably fire for every column/interaction — a real
// user click outside (or Escape) still closes it normally either way, so this only affects
// whether a single-value pick closes the popover for you automatically vs. requiring one more
// click; not worth deeper investigation into PrimeVue's overlay internals for that alone.
function closeFilterOverlay(): void {
    document.body.click();
}

// Decides how a filter type commits: 'instant-close' (a single pick fully specifies the filter,
// so close immediately — select/boolean/single-date, and status/enum when not multi-select),
// 'instant-stay' (text — where typing shouldn't close anything mid-word; and multi-select
// status/enum, where several boxes need to stay open to tick in a row), or 'manual' (amount-range
// calls emit itself only on its own Apply/Clear; custom/none never go through this generic path
// at all). Text's own debouncing happens entirely inside MvColumnFilterText (see its doc
// comment) — this table only ever receives an already-paused value, never a raw keystroke.
function interactionMode(config: ColumnFilterConfig): 'instant-close' | 'instant-stay' | 'manual' {
    switch (config.type) {
        case 'text':
            // MvColumnFilterText already debounces its own emit internally (see its doc
            // comment) — by the time this table receives update:modelValue, a pause has already
            // happened, so writing tableState.filters here right away is correct, not a
            // per-keystroke write. Debouncing again at this level would just stack a second
            // delay on top for no benefit.
            return 'instant-stay';
        case 'status':
        case 'enum':
            return config.multiple ? 'instant-stay' : 'instant-close';
        case 'select':
        case 'boolean':
        case 'single-date':
            return 'instant-close';
        case 'amount-range':
        case 'date-range':
        case 'custom':
        case 'none':
            return 'manual';
    }
}

// `context: 'panel'` (the aggregate Filters popover) never auto-closes on a single-value pick —
// unlike a per-column funnel, that popover exists specifically to set several filters in one
// pass, so closing it the moment any one of them is picked would defeat its own purpose.
function onFilterValueChange(col: ColumnDef, value: unknown, context: 'column' | 'panel' = 'column'): void {
    tableState.value.filters = { ...tableState.value.filters, [col.field]: value };
    emitCurrentFilters();
    const mode = interactionMode(resolveConfig(col));
    if (mode === 'instant-close' && context === 'column') closeFilterOverlay();
}

// PrimeVue swaps the funnel glyph for a filled variant once a column filter has a value (see
// hasFilter() in its own DataTable source), but doesn't recolor it — same neutral gray either
// way, so an applied filter was easy to miss entirely. Highlighting it green (matching the
// design reference) needs our own hook: passed to each filterable <Column>'s `pt.headerCell`
// below, since PrimeVue exposes no ready-made "active" CSS class for a custom filter template.
// `'mode' in value` (not `'min' in value`) is the discriminator for AmountRangeFilterValue —
// deliberately, not incidentally. useDataTableState persists filters via plain
// `JSON.stringify`/`JSON.parse` (see its own source), and `JSON.stringify` drops any key whose
// value is `undefined` — an all-empty amount-range value (`{ mode: 'range', min: undefined, max:
// undefined }`, this table's own DEFAULT_FILTERS.total) round-trips through localStorage as just
// `{"mode":"range"}`, with the `min`/`max` keys gone entirely. Checking `'min' in value` then
// fails (the key isn't there to find), falls through to the generic `return !!value`, and a
// completely empty filter reads as "active" forever — a real, confirmed bug: an accidental
// "Less than" mode + Apply with no number typed (`onApply()` in MvColumnFilterAmountRange.vue
// leaves `singleLocal` at its initial `undefined` if the field was never touched) persists
// `{mode:'less'}`, which showed a permanent "Total: ≤ $undefined" chip on every page load that
// even "Clear filters" couldn't remove (Clear writes the same all-undefined shape, which
// round-trips through localStorage and loses its keys the exact same way). `mode` is a plain
// non-optional string on AmountRangeFilterValue, so unlike `min`/`max` it always survives the
// round-trip — checking for it (rather than for the specific field that determines active-ness)
// is what makes this robust after a reload, not just on the first render before anything's been
// persisted.
function hasValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object' && 'mode' in value) {
        const v = value as AmountRangeFilterValue;
        return v.min !== undefined || v.max !== undefined;
    }
    if (value && typeof value === 'object' && 'preset' in value) {
        const v = value as DateRangeFilterValue;
        return !!v.preset;
    }
    return !!value;
}
function filterActiveClass(field: string): string | undefined {
    if (field === 'payment') return paymentView.value ? 'customer-orders-data-table__th--filtered' : undefined;
    const value = tableState.value.filters[field as keyof CustomerOrdersFilterState];
    return hasValue(value) ? 'customer-orders-data-table__th--filtered' : undefined;
}

// Renders each active filter's current value as a short, human string for the "Active filters"
// chip row — reads the same ALL_COLUMNS/tableState.filters the funnels themselves use, so a chip
// can never describe a value the table isn't actually filtering by.
function describeValue(col: ColumnDef, value: unknown): string {
    const config = resolveConfig(col);
    if (!hasValue(value)) return '';
    switch (config.type) {
        case 'status':
        case 'enum': {
            const values = Array.isArray(value) ? value : [value as string];
            if (values.length > 1) return `${values.length} selected`;
            return config.options.find(o => o.value === values[0])?.label ?? String(values[0]);
        }
        case 'text':
            return `"${value as string}"`;
        case 'date-range': {
            const v = value as DateRangeFilterValue;
            if (v.preset && v.preset !== 'custom') {
                const presets = config.presets ?? DATE_RANGE_PRESETS;
                return presets.find(p => p.key === v.preset)?.label ?? v.preset;
            }
            return v.from && v.to ? `${v.from} – ${v.to}` : v.from || v.to;
        }
        case 'amount-range': {
            const v = value as AmountRangeFilterValue;
            const s = currencySymbol.value;
            if (v.mode === 'equal') return `= ${s}${v.min}`;
            if (v.mode === 'more') return `≥ ${s}${v.min}`;
            if (v.mode === 'less') return `≤ ${s}${v.max}`;
            if (v.min !== undefined && v.max !== undefined) return `${s}${v.min}–${s}${v.max}`;
            if (v.min !== undefined) return `≥ ${s}${v.min}`;
            return `≤ ${s}${v.max}`;
        }
        default:
            return String(value);
    }
}
const activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const f = tableState.value.filters;
    const chips: ActiveFilterChip[] = [];
    for (const col of ALL_COLUMNS) {
        if (col.filterConfig.type === 'none' || col.filterConfig.type === 'custom') continue;
        const value = f[col.field];
        if (!hasValue(value)) continue;
        chips.push({ key: col.field, label: `${col.header}: ${describeValue(col, value)}` });
    }
    return chips;
});
function onRemoveFilterChip(key: string): void {
    const defaults: Record<string, unknown> = {
        code: '',
        state: [],
        fulfillment: [],
        date: { preset: '', from: '', to: '' },
        placedBy: '',
        reservationState: '',
        total: { mode: 'range', min: undefined, max: undefined },
    };
    tableState.value.filters = { ...tableState.value.filters, [key]: defaults[key] };
    emitCurrentFilters();
}

// Payment is wired to the same paymentView the chips above the table use (see ALL_COLUMNS'
// doc comment) — a separate prop/emit, not part of the generic OrderFilterParameter filters, and
// the one sanctioned `custom` filter type (it doesn't fit any standard pattern).
const paymentView = ref<CustomerOrdersView | ''>(props.paymentViewProp === 'all' ? '' : props.paymentViewProp);
watch(
    () => props.paymentViewProp,
    value => {
        paymentView.value = value === 'all' ? '' : value;
    },
);
function onPaymentViewChange(value: CustomerOrdersView | ''): void {
    paymentView.value = value;
    emit('update:payment-view', (value || 'all') as CustomerOrdersView);
    closeFilterOverlay();
}

// PrimeVue only renders a column's funnel icon + filter overlay when the DataTable has
// `filterDisplay` set AND that column's field has an entry in this `filters` object — the actual
// values never live here (tableState.filters is the single source of truth, see above), this is
// purely what makes PrimeVue draw the funnel/overlay chrome and own its open/close. Every
// filterable column (anything not `none`) needs an entry, including 'payment' (the `custom` type)
// since it still needs a real funnel + overlay, just with bespoke content inside.
const columnFilters = ref<DataTableFilterMeta>(
    Object.fromEntries(
        ALL_COLUMNS.filter(c => c.filterConfig.type !== 'none').map(c => [c.field, { value: null, matchMode: 'equals' }]),
    ),
);

const visibleColumns = computed<ColumnDef[]>(() => {
    const byField = new Map(ALL_COLUMNS.map(c => [c.field, c]));
    const hidden = new Set(tableState.value.hiddenColumns);
    return tableState.value.columnOrder
        .filter(field => byField.has(field) && (!hidden.has(field) || byField.get(field)!.required))
        .map(field => {
            const col = byField.get(field)!;
            return { ...col, width: tableState.value.columnWidths[field] ?? col.width };
        });
});

// Feeds MvColumnToggle (ui-kit) — order follows the persisted columnOrder (so the popover list
// matches what's currently on screen, not ALL_COLUMNS' static declaration order), and required
// columns are always reported visible regardless of hiddenColumns.
const columnToggleItems = computed(() =>
    tableState.value.columnOrder
        .map(field => ALL_COLUMNS.find(c => c.field === field))
        .filter((c): c is ColumnDef => !!c)
        .map(c => ({
            key: c.field,
            label: c.header,
            required: c.required,
            visible: !!c.required || !tableState.value.hiddenColumns.includes(c.field),
        })),
);
function onColumnToggle(field: string): void {
    const hidden = new Set(tableState.value.hiddenColumns);
    if (hidden.has(field)) hidden.delete(field);
    else hidden.add(field);
    tableState.value.hiddenColumns = [...hidden];
}
function onColumnsReorder(order: string[]): void {
    tableState.value.columnOrder = order;
}
// "Reset layout" lives only here, inside the Columns panel's own footer — not duplicated as a
// separate top-level toolbar button. Resets column order/width/visibility and sort, deliberately
// NOT filters — filter state has its own separate reset (the "Clear filters" action in the
// Active-filters chip row below), so one button no longer does two unrelated things at once.
// Real bug found live: PrimeVue's resizableColumns implementation (see resizeTableCells() in its
// own datatable source) applies a resized column's new width by injecting its OWN <style> element
// into document.head, with `!important` width/max-width rules keyed by nth-child position —
// entirely separate from, and always winning over, the plain `:style="{ width: ... }"` binding
// this table's own Column uses. That stylesheet is only ever destroyed/recreated on the *next*
// resize (or on the DataTable unmounting) — there's no public API to clear it directly. Resetting
// our own tableState.columnWidths correctly updates our reactive binding, but PrimeVue's
// `!important` override from the last resize stays in the DOM regardless, so the table visually
// stayed at whatever width was last dragged even after a "successful" reset. Bumping the
// DataTable's own `:key` forces a full unmount/remount, which runs PrimeVue's own cleanup
// (destroying that stylesheet) and re-renders columns fresh from our now-reset widths — the only
// reliable way to actually undo a resize's visual effect, not just its persisted value.
const tableRemountKey = ref(0);

function onColumnsReset(): void {
    tableState.value.hiddenColumns = [];
    tableState.value.columnOrder = ALL_COLUMNS.map(c => c.field);
    tableState.value.columnWidths = Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width]));
    tableState.value.sort = [{ field: 'date', order: -1 }];
    emit('update:sort', { createdAt: 'DESC' });
    tableRemountKey.value++;
}

function resetFilters(): void {
    tableState.value.filters = {
        code: '',
        state: [],
        fulfillment: [],
        date: { preset: '', from: '', to: '' },
        placedBy: '',
        reservationState: '',
        total: { mode: 'range', min: undefined, max: undefined },
    };
    paymentView.value = '';
    emitCurrentFilters();
    emit('update:payment-view', 'all');
}

function onColumnResizeEnd(event: { element: HTMLElement; delta: number }): void {
    const headerText = event.element?.querySelector('.customer-orders-data-table__col-title')?.textContent?.trim();
    const col = ALL_COLUMNS.find(c => c.header === headerText);
    if (!col) return;
    const current = tableState.value.columnWidths[col.field] ?? col.width;
    // Real bug, present since this table's first commit: this used to write `current` straight
    // back to itself (never applying `event.delta`, PrimeVue's actual resize amount) — visually
    // the column resized fine (PrimeVue applies the new width immediately via its own injected
    // <style> during the drag), but nothing was ever actually persisted, so a reload silently
    // reverted every resize, and "Reset table layout" had nothing real to reset either — the
    // stored width was already stuck at its old value the whole time.
    tableState.value.columnWidths = { ...tableState.value.columnWidths, [col.field]: current + event.delta };
}

function sortToVendure(meta: DataTableSortMeta[]): Partial<Record<OrderSortField, 'ASC' | 'DESC'>> {
    const result: Partial<Record<OrderSortField, 'ASC' | 'DESC'>> = {};
    for (const m of meta) {
        const col = ALL_COLUMNS.find(c => c.field === m.field);
        if (col?.sortField) result[col.sortField] = m.order === 1 ? 'ASC' : 'DESC';
    }
    return Object.keys(result).length ? result : { createdAt: 'DESC' };
}

// Fully custom, single-column sort — see OrdersDataTable.vue's identical `toggleSort()` doc
// comment for why PrimeVue's own `sortable`/`sort-mode="multiple"` was dropped entirely (fighting
// its whole-header click binding and internal hover classes broke sorting outright). One active
// sort column with a directional arrow, rendered via each Column's own `#header` template below.
function toggleSort(col: ColumnDef): void {
    if (!col.sortField) return;
    const current = tableState.value.sort[0];
    const next: DataTableSortMeta =
        current?.field === col.field ? { field: col.field, order: current.order === 1 ? -1 : 1 } : { field: col.field, order: 1 };
    tableState.value.sort = [next];
    emit('update:sort', sortToVendure([next]));
}

function sortIconFor(col: ColumnDef): Component {
    const active = tableState.value.sort[0];
    if (active?.field !== col.field) return Sort;
    return active.order === 1 ? SortUp : SortDown;
}

// PrimeVue's own header mousedown handler (bound directly on each sortable/reorderable `th`) arms
// a native HTML5 column-drag on ANY mousedown there that isn't an <input>/<textarea>/the resize
// handle — nothing in that check knows about our own custom sort button or reorder handle, so
// without this, dragging the title, the sort button, or genuinely empty header space all start a
// column drag too (confirmed live — an earlier version tried covering the "empty space" case with
// a flex-growing spacer element instead, but that visually dragged the sort/reorder icons away
// from the title as the column got wider, which looked broken in its own way).
// This delegated listener is registered on the wrapper (bubble phase, ordinary Vue template
// binding — not `.capture`), so by DOM bubble order it always runs *after* the `th`'s own
// mousedown listener already ran and set `draggable`. That means this only has to *correct*
// `draggable` back to `false` when the real mousedown target isn't inside the reorder handle —
// robust regardless of column reorders/rebuilds, since it's one listener on a stable ancestor, not
// something reattached per header cell.
function onHeaderMousedown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const th = target.closest('th');
    if (!th) return;
    const isHandle = !!target.closest('.customer-orders-data-table__reorder-handle');
    if (!isHandle) {
        (th as HTMLElement).draggable = false;
    }
}

function onPage(event: { page: number; rows: number }): void {
    tableState.value.pageSize = event.rows;
    emit('update:page-size', event.rows);
    emit('update:page', event.page + 1);
}

function onRowClick(event: { data: TableRow }): void {
    router.push(`/orders/${event.data.code as string}`);
}

function onColumnReorder(event: { dragIndex: number; dropIndex: number }): void {
    const order = [...tableState.value.columnOrder];
    const [moved] = order.splice(event.dragIndex, 1);
    order.splice(event.dropIndex, 0, moved);
    tableState.value.columnOrder = order;
}

</script>

<template>
    <div class="customer-orders-data-table" @mousedown="onHeaderMousedown">
        <div class="customer-orders-data-table__toolbar">
            <div class="customer-orders-data-table__toolbar-start">
                <!-- Same `code` field the Order # column's own funnel filters — not a second,
                     parallel search mechanism. Reuses MvColumnFilterText itself (not a raw
                     <input>) so its internal debounce/local-state (see its own doc comment on
                     the focus-loss bug that protects against) applies here too. -->
                <component
                    :is="resolveColumnFilterComponent('text')"
                    :config="{ type: 'text', placeholder: 'Search orders…' }"
                    :model-value="tableState.filters.code"
                    @update:model-value="onFilterValueChange(CODE_COLUMN, $event)"
                />
                <!-- Each table defines its own quick-filter chips (e.g. All/Unpaid/Partially
                     paid/Cancelled — see CustomerOrdersTab.vue) — this is just the reserved slot
                     for them, empty by default. -->
                <slot name="view-chips" />
            </div>
            <div class="customer-orders-data-table__toolbar-end">
                <MvColumnToggle
                    :columns="columnToggleItems"
                    trigger-label=""
                    searchable
                    reorderable
                    show-footer
                    @toggle="onColumnToggle"
                    @reorder="onColumnsReorder"
                    @reset="onColumnsReset"
                >
                    <template #icon>
                        <Setting class="customer-orders-data-table__btn-icon" />
                    </template>
                </MvColumnToggle>
            </div>
        </div>

        <MvActiveFilterChips :chips="activeFilterChips" @remove="onRemoveFilterChip" @clear-all="resetFilters" />

        <DataTable
            :key="tableRemountKey"
            :value="rows"
            :loading="loading"
            data-key="code"
            lazy
            paginator
            :rows="pageSize"
            :rows-per-page-options="[10, 20, 50]"
            :total-records="totalItems"
            scrollable
            :scroll-height="dynamicScrollHeight"
            resizable-columns
            column-resize-mode="expand"
            reorderable-columns
            filter-display="menu"
            v-model:filters="columnFilters"
            row-hover
            class="customer-orders-data-table__grid"
            @page="onPage"
            @column-reorder="onColumnReorder"
            @column-resize-end="onColumnResizeEnd"
            @row-click="onRowClick"
        >
            <template #empty>No orders yet</template>
            <Column
                v-for="col in visibleColumns"
                :key="col.field"
                :field="col.field"
                :style="{ width: col.width + 'px' }"
                :pt="{ headerCell: { class: filterActiveClass(col.field) } }"
                :show-filter-match-modes="false"
                :show-filter-operator="false"
                :show-add-button="false"
                :show-apply-button="false"
                :show-clear-button="false"
            >
                <template #header>
                    <span class="customer-orders-data-table__col-title">{{ col.header }}</span>
                    <button
                        v-if="col.sortField"
                        type="button"
                        class="customer-orders-data-table__sort-btn"
                        :class="{ 'customer-orders-data-table__sort-btn--active': tableState.sort[0]?.field === col.field }"
                        @click.stop="toggleSort(col)"
                    >
                        <component :is="sortIconFor(col)" class="customer-orders-data-table__sort-icon" />
                    </button>
                    <span class="customer-orders-data-table__reorder-handle" title="Drag to reorder column">
                        <Rank class="customer-orders-data-table__reorder-icon" />
                    </span>
                </template>
                <template v-if="col.field === 'state'" #body="{ data }">
                    <MvStatusBadge :variant="(data as TableRow).stateVariant as StatusBadgeVariant">{{ (data as TableRow).state }}</MvStatusBadge>
                </template>

                <template v-if="col.field === 'fulfillment'" #body="{ data }">
                    <div class="customer-orders-data-table__fulfillment">
                        <MvStatusBadge :variant="(data as TableRow).fulfillmentVariant as StatusBadgeVariant">
                            {{ (data as TableRow).fulfillment }}
                        </MvStatusBadge>
                        <div class="customer-orders-data-table__progress-track">
                            <span
                                class="customer-orders-data-table__progress-fill"
                                :style="{ width: `${(data as TableRow).fulfillmentProgress as number}%` }"
                            />
                        </div>
                    </div>
                </template>

                <template v-if="col.field === 'reservationState'" #body="{ data }">
                    <MvStatusBadge :variant="(data as TableRow).reservationVariant as StatusBadgeVariant">{{ (data as TableRow).reservation }}</MvStatusBadge>
                </template>

                <template v-if="col.field === 'payment'" #body="{ data }">
                    <MvStatusBadge :variant="(data as TableRow).paymentVariant as StatusBadgeVariant">{{ (data as TableRow).payment }}</MvStatusBadge>
                </template>
                <!-- The one sanctioned `custom` filter — see ALL_COLUMNS' doc comment. Reuses the
                     same colored-badge checklist every other status-shaped filter uses
                     (MvColumnFilterStatus) instead of a plain unstyled native <select> — single-
                     select here since the backend paymentView only ever takes one value. -->
                <template v-if="col.field === 'payment'" #filter>
                    <MvColumnFilterStatus
                        :config="PAYMENT_FILTER_CONFIG"
                        :model-value="paymentView"
                        @update:model-value="onPaymentViewChange($event as CustomerOrdersView | '')"
                    />
                </template>

                <!-- Every other filterable column goes through the registry — one generic
                     dispatch instead of a hand-written template per field. -->
                <template v-if="col.filterConfig.type !== 'none' && col.filterConfig.type !== 'custom'" #filter>
                    <component
                        :is="resolveColumnFilterComponent(col.filterConfig.type)"
                        :config="resolveConfig(col)"
                        :model-value="tableState.filters[col.field as keyof CustomerOrdersFilterState]"
                        @update:model-value="onFilterValueChange(col, $event)"
                        @close="closeFilterOverlay"
                    />
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<style scoped>
.customer-orders-data-table__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
}

.customer-orders-data-table__toolbar-start {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.customer-orders-data-table__toolbar-end {
    display: flex;
    gap: 8px;
}

.customer-orders-data-table__btn-icon {
    width: 15px;
    height: 15px;
}

.customer-orders-data-table__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    margin-left: 6px;
    border-radius: 999px;
    background: var(--el-color-primary, #00b894);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
}

.customer-orders-data-table__grid {
    width: 100%;
}

.customer-orders-data-table__fulfillment {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.customer-orders-data-table__progress-track {
    width: 108px;
    height: 6px;
    background: var(--el-fill-color-light, #edf1f4);
    border-radius: 999px;
    overflow: hidden;
}

.customer-orders-data-table__progress-fill {
    display: block;
    height: 100%;
    background: var(--el-color-primary, #00b894);
}

/* PrimeVue's default header layout puts the sort icon and the filter (funnel) icon at opposite
   ends of the header cell. Two separate causes, both needed fixing:
   1. `.p-datatable-column-header-content` itself defaults to `justify-content: space-between`.
   2. Even after packing it left, `.p-datatable-filter` (the funnel's own wrapper) carries its
      own `margin-inline-start: auto` in PrimeVue's base styles — an auto margin on a flex item
      consumes all remaining free space in that direction regardless of the parent's
      justify-content, so on any column wider than its content the funnel still shot off to the
      far right (confirmed by actually dragging a column wider and watching it happen) while
      title+sort stayed put. Cause #2 is the one that actually matters; #1 only showed up at the
      column's natural (narrow) width. */
:deep(.p-datatable-column-header-content) {
    justify-content: flex-start;
    gap: 2px;
}

/* Our own sort control, rendered via each Column's `#header` template — not PrimeVue's built-in
   `sortable` (see toggleSort()'s doc comment for why: fighting its whole-header click binding and
   internal hover/selected-column classes via `!important` broke sorting outright). A plain button
   we fully own means no more racing PrimeVue's internal specificity for hover or click-target
   sizing — its hover matches the filter funnel's own hover further down, so the two interactive
   header controls read as one consistent affordance. */
.customer-orders-data-table__col-title {
    cursor: default;
}

.customer-orders-data-table__sort-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-inline-start: 8px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--el-text-color-secondary, #98a2b3);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.customer-orders-data-table__sort-btn:hover {
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
}

.customer-orders-data-table__sort-btn--active {
    color: var(--el-color-primary, #00b894);
}

.customer-orders-data-table__sort-icon {
    width: 16px;
    height: 16px;
}

/* See onHeaderMousedown()'s doc comment for why dragging is restricted to this handle without
   a flex-growing spacer (an earlier version used one, and it visually dragged this icon away from
   the title as the column got wider). */
.customer-orders-data-table__reorder-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-inline: 4px 6px;
    border-radius: 6px;
    color: var(--el-text-color-secondary, #98a2b3);
    cursor: grab;
    transition: background-color 0.15s, color 0.15s;
}

.customer-orders-data-table__reorder-handle:hover {
    background: var(--el-color-primary-light-9, #e6faf4);
    color: var(--el-color-primary, #00b894);
}

.customer-orders-data-table__reorder-icon {
    width: 15px;
    height: 15px;
}

/* PrimeVue's resize handle is a full-height strip at each column's trailing edge, but its default
   border is fully transparent — no visible affordance a column boundary is draggable at all until
   the cursor already happens to land on it. The full-height *hit area* stays as-is (shrinking it
   would make the boundary harder to actually grab) — only the *visible* line is a short, centered
   mark via `::after`, rather than a line spanning the whole header cell's height edge-to-edge,
   which read as an oddly heavy full-height divider. */
:deep(.p-datatable-column-resizer)::after {
    content: '';
    position: absolute;
    inset-inline-end: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 20px;
    background: var(--el-border-color, #e4e7ec);
}

:deep(.p-datatable-column-resizer:hover)::after {
    width: 2px;
    background: var(--el-color-primary, #00b894);
}

:deep(.p-datatable-filter) {
    margin-inline-start: 0;
}

/* The default filter-button hover was the same barely-visible PrimeVue gray as the (now removed)
   whole-header hover — replaced with the same light-green highlight as the sort icon above, so
   both header icons hover identically. */
:deep(.p-datatable-column-filter-button:hover) {
    background: var(--el-color-primary-light-9, #e6faf4) !important;
    color: var(--el-color-primary, #00b894) !important;
}

/* The filter button's own 40x40 click target (a comfortable touch-target size PrimeVue
   defaults to) also left ~18px of invisible padding before the funnel glyph itself. Shrink the
   button so the visible icon sits close to the sort arrow next to it. */
:deep(.p-datatable-column-filter-button) {
    width: 22px;
    height: 22px;
}

/* See `filterActiveClass()`'s doc comment — PrimeVue itself only swaps the funnel glyph shape
   on an applied filter, not its color, so this class (applied to that column's own header
   cell) is the only signal a filter is active without opening the popup. */
:deep(.customer-orders-data-table__th--filtered .p-datatable-column-filter-button) {
    color: var(--el-color-primary, #00b894);
}
</style>
