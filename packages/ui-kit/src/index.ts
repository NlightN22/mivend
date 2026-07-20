export { default as MvSearchInput } from './components/MvSearchInput/MvSearchInput.vue';
export type {
    SuggestionGroup,
    SuggestionGroupType,
    SuggestionItem,
} from './components/MvSearchInput/MvSearchInput.vue';

export { default as MvTable } from './components/MvTable/MvTable.vue';
export type { TableRow, RowState } from './components/MvTable/MvTable.vue';
export { default as MvMobileCardList } from './components/MvTable/MvMobileCardList.vue';
export type { MvMobileColumn, MvMobileColumnMeta } from './components/MvTable/MvMobileCardList.vue';
export type {
    MvDataTableColumn,
    DataTableColumnFilter,
    DataTableFilterKind,
} from './components/MvTable/dataTableTypes';
export { toColumnVisibilityDefs } from './components/MvTable/dataTableTypes';
export { useDataTableState, normalizeDataTableState } from './composables/useDataTableState';
export type {
    DataTableState,
    DataTableSortMeta,
    DataTableColumnMeta,
    UseDataTableStateOptions,
} from './composables/useDataTableState';
export { default as MvDataTableToolbar } from './components/MvDataTableToolbar/MvDataTableToolbar.vue';

export { default as MvPageHeader } from './components/MvPageHeader/MvPageHeader.vue';
export type { Breadcrumb } from './components/MvPageHeader/MvPageHeader.vue';

export { default as MvButton } from './components/MvButton/MvButton.vue';
export type { ButtonVariant, ButtonSize } from './components/MvButton/MvButton.vue';

export { default as MvStatusTag } from './components/MvStatusTag/MvStatusTag.vue';
export type { StatusTagVariant } from './components/MvStatusTag/MvStatusTag.vue';

export { default as MvStatusBadge } from './components/MvStatusBadge/MvStatusBadge.vue';
export type { StatusBadgeVariant } from './components/MvStatusBadge/MvStatusBadge.vue';

export { default as MvAmountDisplay } from './components/MvAmountDisplay/MvAmountDisplay.vue';
export type { AmountSize } from './components/MvAmountDisplay/MvAmountDisplay.vue';

export { default as MvFormField } from './components/MvFormField/MvFormField.vue';

export { default as MvInput } from './components/MvInput/MvInput.vue';

export { default as MvPasswordInput } from './components/MvPasswordInput/MvPasswordInput.vue';

export { default as MvNotice } from './components/MvNotice/MvNotice.vue';
export type { NoticeVariant } from './components/MvNotice/MvNotice.vue';

export { default as MvToast } from './components/MvToast/MvToast.vue';
export { default as MvToastContainer } from './components/MvToast/MvToastContainer.vue';
export { useToast, toast, dismissToast } from './composables/useToast';
export type { ToastItem } from './composables/useToast';

export { default as MvModal } from './components/MvModal/MvModal.vue';

export { default as MvLogo } from './components/MvLogo/MvLogo.vue';
export type { LogoSize } from './components/MvLogo/MvLogo.vue';

export { default as MvFavoriteButton } from './components/MvFavoriteButton/MvFavoriteButton.vue';

export { default as MvProductCard } from './components/MvProductCard/MvProductCard.vue';

export { default as MvProductRow } from './components/MvProductRow/MvProductRow.vue';

export { default as MvCatalogFacets } from './components/MvCatalogFacets/MvCatalogFacets.vue';

export { default as MvProductGallery } from './components/MvProductGallery/MvProductGallery.vue';

export { default as MvProductMainCards } from './components/MvProductMainCards/MvProductMainCards.vue';

export { default as MvStockBadge } from './components/MvStockBadge/MvStockBadge.vue';
export { default as MvQtyStepper } from './components/MvQtyStepper/MvQtyStepper.vue';
export { default as MvCard } from './components/MvCard/MvCard.vue';
export { default as MvBreadcrumbs } from './components/MvBreadcrumbs/MvBreadcrumbs.vue';
export { default as MvIconButton } from './components/MvIconButton/MvIconButton.vue';
export type { IconButtonVariant } from './components/MvIconButton/MvIconButton.vue';
export { default as MvCatalogDropdown } from './components/MvCatalogDropdown/MvCatalogDropdown.vue';
export type { CollectionNode } from './components/MvCatalogDropdown/MvCatalogDropdown.vue';

export { default as MvTooltip } from './components/MvTooltip/MvTooltip.vue';
export { default as MvDiscountBadge } from './components/MvDiscountBadge/MvDiscountBadge.vue';
export type { DiscountTier } from './components/MvDiscountBadge/MvDiscountBadge.vue';
export { default as MvProgressBar } from './components/MvProgressBar/MvProgressBar.vue';
export type { ProgressBarVariant } from './components/MvProgressBar/MvProgressBar.vue';

export { default as MvKpiCard } from './components/MvKpiCard/MvKpiCard.vue';
export { default as MvSkeleton } from './components/MvSkeleton/MvSkeleton.vue';
export { default as MvFilterChips } from './components/MvFilterChips/MvFilterChips.vue';
export type { FilterChip } from './components/MvFilterChips/MvFilterChips.vue';
export { default as MvPanel } from './components/MvPanel/MvPanel.vue';
export { default as MvCountBadge } from './components/MvCountBadge/MvCountBadge.vue';
export { default as MvAppTopbar } from './components/MvAppTopbar/MvAppTopbar.vue';
export { default as MvAppSidebar } from './components/MvAppSidebar/MvAppSidebar.vue';
export type { AppSidebarItem } from './components/MvAppSidebar/MvAppSidebar.vue';
export { default as MvAppMobileNav } from './components/MvAppMobileNav/MvAppMobileNav.vue';
export type { AppMobileNavItem } from './components/MvAppMobileNav/MvAppMobileNav.vue';
export { default as MvAppMobileMoreSheet } from './components/MvAppMobileMoreSheet/MvAppMobileMoreSheet.vue';
export type { AppMobileSheetItem } from './components/MvAppMobileMoreSheet/MvAppMobileMoreSheet.vue';
export { default as MvFab } from './components/MvFab/MvFab.vue';
export { default as MvRoundIconButton } from './components/MvRoundIconButton/MvRoundIconButton.vue';
export { default as MvScrollNav } from './components/MvScrollNav/MvScrollNav.vue';
export { default as MvKpiCarousel } from './components/MvKpiCarousel/MvKpiCarousel.vue';

export { default as MvSelect } from './components/MvSelect/MvSelect.vue';
export type { SelectOption } from './components/MvSelect/MvSelect.vue';

export { default as MvCheckbox } from './components/MvCheckbox/MvCheckbox.vue';
export { default as MvColumnToggle } from './components/MvColumnToggle/MvColumnToggle.vue';
export { useColumnVisibility } from './composables/useColumnVisibility';
export type { ColumnVisibilityDef } from './composables/useColumnVisibility';
export { useIsMobileViewport } from './composables/useIsMobileViewport';
export { useDebouncedCallback } from './composables/useDebouncedCallback';
export { usePagedScrollHeight } from './composables/usePagedScrollHeight';
export type { PagedScrollHeightOptions } from './composables/usePagedScrollHeight';
export { useHorizontalScrollFade } from './composables/useHorizontalScrollFade';
export type { HorizontalScrollFade } from './composables/useHorizontalScrollFade';
export { useLatestRequest } from './composables/useLatestRequest';
export type { UseLatestRequest } from './composables/useLatestRequest';
export { default as MvScrollFadeOverlay } from './components/MvScrollFadeOverlay/MvScrollFadeOverlay.vue';

export { default as MvDatePicker } from './components/MvDatePicker/MvDatePicker.vue';

// Typed column-filter system (AGENTS.md manager-portal rules) — every filterable data-table
// column declares one of these types explicitly; the table resolves the matching component via
// COLUMN_FILTER_REGISTRY instead of building its own popover/input/select per column.
export * from './components/MvColumnFilter/columnFilterTypes';
export {
    COLUMN_FILTER_REGISTRY,
    resolveColumnFilterComponent,
} from './components/MvColumnFilter/columnFilterRegistry';
export { default as MvColumnFilterText } from './components/MvColumnFilter/MvColumnFilterText.vue';
export { default as MvColumnFilterSelect } from './components/MvColumnFilter/MvColumnFilterSelect.vue';
export { default as MvColumnFilterBoolean } from './components/MvColumnFilter/MvColumnFilterBoolean.vue';
export { default as MvColumnFilterStatus } from './components/MvColumnFilter/MvColumnFilterStatus.vue';
export { default as MvColumnFilterEnum } from './components/MvColumnFilter/MvColumnFilterEnum.vue';
export { default as MvColumnFilterDate } from './components/MvColumnFilter/MvColumnFilterDate.vue';
export { default as MvColumnFilterDateRange } from './components/MvColumnFilter/MvColumnFilterDateRange.vue';
export {
    DATE_RANGE_PRESETS,
    resolveDateRangePreset,
} from './components/MvColumnFilter/dateRangePresets';
export { default as MvColumnFilterAmountRange } from './components/MvColumnFilter/MvColumnFilterAmountRange.vue';
export {
    closePrimeVueFilterOverlay,
    interactionMode,
    hasValue,
    describeValue,
} from './components/MvColumnFilter/columnFilterDispatch';

export { default as MvActiveFilterChips } from './components/MvActiveFilterChips/MvActiveFilterChips.vue';
export type { ActiveFilterChip } from './components/MvActiveFilterChips/MvActiveFilterChips.vue';

// The standard desktop table for the manager portal (AGENTS.md) — see
// MvAdvancedDataTable.vue's own doc comment for the full feature set and component boundary.
export { default as MvAdvancedDataTable } from './components/MvAdvancedDataTable/MvAdvancedDataTable.vue';
export type {
    AdvancedDataTableColumn,
    AdvancedDataTableSearchConfig,
    AdvancedDataTableRowClickPayload,
} from './components/MvAdvancedDataTable/advancedDataTableTypes';

export { default as MvMultiSelect } from './components/MvMultiSelect/MvMultiSelect.vue';

export { default as MvFilterBar } from './components/MvFilterBar/MvFilterBar.vue';
export { default as MvFilterField } from './components/MvFilterBar/MvFilterField.vue';
export { default as MvTableFilters } from './components/MvFilterBar/MvTableFilters.vue';
export type { TableFilterFieldDef } from './components/MvFilterBar/MvTableFilters.vue';
export {
    matchesTableFilters,
    deriveFilterSuggestions,
} from './components/MvFilterBar/tableFilterMatch';

export { default as MvPagination } from './components/MvPagination/MvPagination.vue';

export { default as MvWarningBanner } from './components/MvWarningBanner/MvWarningBanner.vue';

export { default as MvApprovalStepper } from './components/MvApprovalStepper/MvApprovalStepper.vue';
export type {
    ApprovalStepState,
    ApprovalStepperItem,
} from './components/MvApprovalStepper/MvApprovalStepper.vue';

export { colors } from './tokens/colors';
export type { ColorToken } from './tokens/colors';

export { spacing, radius, shadows } from './tokens/spacing';
export type { SpacingToken, RadiusToken, ShadowToken } from './tokens/spacing';

export { typography } from './tokens/typography';
export type { FontSizeToken } from './tokens/typography';
