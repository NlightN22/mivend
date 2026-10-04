import { SortOrder, type SearchResultSortParameter } from '../api/generated/graphql';

export interface SortOption {
    value: string;
    label: string;
}

const SORTS: Record<string, { label: string; sort?: SearchResultSortParameter }> = {
    relevance: { label: 'Relevance' },
    name_asc: { label: 'Name A-Z', sort: { name: SortOrder.Asc } },
    name_desc: { label: 'Name Z-A', sort: { name: SortOrder.Desc } },
    price_asc: { label: 'Lowest price first', sort: { price: SortOrder.Asc } },
    price_desc: { label: 'Highest price first', sort: { price: SortOrder.Desc } },
};

export function buildSort(key: string): SearchResultSortParameter | undefined {
    return SORTS[key]?.sort;
}

export function toSortOptions(keys: string[]): SortOption[] {
    return keys.filter(key => key in SORTS).map(key => ({ value: key, label: SORTS[key].label }));
}
