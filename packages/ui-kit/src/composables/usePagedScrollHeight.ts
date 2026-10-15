import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue';

export interface PagedScrollHeightOptions {
    rowHeightPx: number;
    headerHeightPx: number;
}

// rowHeightPx must be the real rendered row height, not a constant: a <td> height is only a minimum,
// so any taller cell content makes rows grow and the computed scroll area comes up short.
export function usePagedScrollHeight(
    pageSize: MaybeRefOrGetter<number>,
    options: PagedScrollHeightOptions,
): ComputedRef<string> {
    return computed(() => `${toValue(pageSize) * options.rowHeightPx + options.headerHeightPx}px`);
}
