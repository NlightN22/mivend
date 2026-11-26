import type { FilterColumn, FilterOperator, FilterSuggest } from './filterBuilderTypes';

export interface ReferenceColumnDeclaration {
    key: string;
    label: string;
    // Server-backed lookup inside the viewer's scope; picked values are the names it returns.
    lookup: FilterSuggest;
    serverField?: string;
    // Offer "is not one of" only when the server can exclude (the analytics contract cannot yet).
    exclude?: boolean;
}

// One declaration per reference-data column: contains (typed name) and pick-from-lookup operators.
export function referenceColumn(decl: ReferenceColumnDeclaration): FilterColumn {
    const operators: FilterOperator[] = decl.exclude
        ? ['contains', 'in', 'notIn']
        : ['contains', 'in'];
    return {
        key: decl.key,
        label: decl.label,
        type: 'reference',
        operators,
        serverField: decl.serverField,
        suggest: decl.lookup,
    };
}
