import { CATEGORY_FACET_CODE, categorySlug } from 'shared';

export interface CategoryFacetValueRef {
    id: string | number;
    code: string;
    facetCode: string;
}

export function categorySlugsOf(values: CategoryFacetValueRef[]): string[] {
    return values.filter(v => v.facetCode === CATEGORY_FACET_CODE).map(v => categorySlug(v.code));
}

// A category facet value is hidden when the Collection with its slug is private.
export function hiddenFacetValueIds(
    values: CategoryFacetValueRef[],
    privateSlugs: ReadonlySet<string>,
): Set<string> {
    return new Set(
        values
            .filter(
                v => v.facetCode === CATEGORY_FACET_CODE && privateSlugs.has(categorySlug(v.code)),
            )
            .map(v => String(v.id)),
    );
}
