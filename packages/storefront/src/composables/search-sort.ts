import { i18n } from '../i18n';
import { SortOrder, type SearchResultSortParameter } from '../api/generated/graphql';

export interface SortOption {
    value: string;
    label: string;
}

type SortLabelKey = `sort.${'relevance' | 'nameAsc' | 'nameDesc' | 'priceAsc' | 'priceDesc'}`;

const SORTS: Record<string, { label: SortLabelKey; sort?: SearchResultSortParameter }> = {
    relevance: { label: 'sort.relevance' },
    name_asc: { label: 'sort.nameAsc', sort: { name: SortOrder.Asc } },
    name_desc: { label: 'sort.nameDesc', sort: { name: SortOrder.Desc } },
    price_asc: { label: 'sort.priceAsc', sort: { price: SortOrder.Asc } },
    price_desc: { label: 'sort.priceDesc', sort: { price: SortOrder.Desc } },
};

export function buildSort(key: string): SearchResultSortParameter | undefined {
    return SORTS[key]?.sort;
}

export function toSortOptions(keys: string[]): SortOption[] {
    return keys
        .filter(key => key in SORTS)
        .map(key => ({ value: key, label: i18n.global.t(SORTS[key].label) }));
}
