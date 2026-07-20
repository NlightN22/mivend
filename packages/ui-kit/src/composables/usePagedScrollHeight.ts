import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';

export interface PagedScrollHeightOptions {
    rowHeightPx: number;
    headerHeightPx: number;
}

/**
 * Fits a paginated table's scroll area to exactly the selected page size, instead of a fixed
 * viewport-relative height that either wastes space (small page size) or clips rows (large page
 * size) regardless of how many rows are actually on screen.
 *
 * `rowHeightPx` must be the row's real minimum rendered height (padding + tallest cell content +
 * border), not a guessed constant — a `<td>`'s `height` in table layout is only a minimum, so if
 * any column's content needs more room than assumed, every row silently grows past this value and
 * the computed scroll area falls short again.
 */
export function usePagedScrollHeight(
    pageSize: MaybeRefOrGetter<number>,
    options: PagedScrollHeightOptions,
): ComputedRef<string> {
    return computed(() => `${toValue(pageSize) * options.rowHeightPx + options.headerHeightPx}px`);
}
