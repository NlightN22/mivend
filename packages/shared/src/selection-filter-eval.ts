import type { FilterTerm } from './selection-filter';

export interface ProductAttributes {
    productRef: string;
    manufacturerRef: string | null;
    // The product's own category and every ancestor category (ERP ids).
    categoryRefs: ReadonlySet<string>;
}

// Which of the refs used by the terms exist in mivend, by kind.
export interface RefResolution {
    manufacturers: ReadonlySet<string>;
    categories: ReadonlySet<string>;
    products: ReadonlySet<string>;
}

function productMatches(term: FilterTerm, attrs: ProductAttributes): boolean {
    return term.refs.some(
        ref => ref === attrs.productRef || (term.hierarchical && attrs.categoryRefs.has(ref)),
    );
}

// A negated term needs a known attribute: a product with no manufacturer or category may still sit in the ERP group.
function termHolds(term: FilterTerm, attrs: ProductAttributes, known: RefResolution): boolean {
    if (term.field === 'manufacturer') {
        const unresolved = term.refs.some(ref => !known.manufacturers.has(ref));
        if (unresolved && (term.negated || term.hierarchical)) return false;
        if (term.negated && attrs.manufacturerRef === null) return false;
        const matched = attrs.manufacturerRef !== null && term.refs.includes(attrs.manufacturerRef);
        return term.negated ? !matched : matched;
    }
    const unresolved = term.refs.some(
        ref => !known.products.has(ref) && !known.categories.has(ref),
    );
    if (unresolved && term.negated) return false;
    if (term.negated && term.hierarchical && attrs.categoryRefs.size === 0) return false;
    const matched = productMatches(term, attrs);
    return term.negated ? !matched : matched;
}

// All terms are ANDed; an empty term list never matches (fail closed).
export function evaluateProductTerms(
    terms: readonly FilterTerm[],
    attrs: ProductAttributes,
    known: RefResolution,
): boolean {
    return terms.length > 0 && terms.every(term => termHolds(term, attrs, known));
}

export function evaluateCounterpartyTerms(
    terms: readonly FilterTerm[],
    counterpartyErpId: string,
): boolean {
    return (
        terms.length > 0 &&
        terms.every(term => term.refs.includes(counterpartyErpId) !== term.negated)
    );
}
