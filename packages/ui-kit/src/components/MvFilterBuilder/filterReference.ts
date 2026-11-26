import type { FilterColumn, FilterOperator, FilterSuggest } from './filterBuilderTypes';

export interface ReferenceColumnDeclaration {
    key: string;
    label: string;
    // Server-backed lookup inside the viewer's scope; picked values are the names it returns.
    lookup: FilterSuggest;
    serverField?: string;
    // Offer "is not one of" only where the server can exclude.
    exclude?: boolean;
    // Offer "in group" / "not in group" over a hierarchical catalog; the lookup returns group tokens.
    groups?: { lookup: FilterSuggest };
}

const TOKEN_SEPARATOR = ':';

// A picked group travels as `id:path`: the id goes to the server, the path is what people read.
export const groupToken = (id: string, path: string): string => `${id}${TOKEN_SEPARATOR}${path}`;

export const groupTokenId = (token: string): string => token.split(TOKEN_SEPARATOR, 1)[0] ?? '';

export function groupTokenName(token: string): string {
    const at = token.indexOf(TOKEN_SEPARATOR);
    return at < 0 ? token : token.slice(at + 1);
}

// One declaration per reference-data column: contains (typed name), pick-from-lookup and group operators.
export function referenceColumn(decl: ReferenceColumnDeclaration): FilterColumn {
    const operators: FilterOperator[] = ['contains', 'in'];
    if (decl.exclude) operators.push('notIn');
    if (decl.groups) operators.push('inGroup', ...(decl.exclude ? (['notInGroup'] as const) : []));
    return {
        key: decl.key,
        label: decl.label,
        type: 'reference',
        operators,
        serverField: decl.serverField,
        suggest: decl.lookup,
        groupSuggest: decl.groups?.lookup,
    };
}
