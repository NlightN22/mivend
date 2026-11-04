import type { ElasticSearchSortInput } from '@vendure/elasticsearch-plugin/lib/src/types';

import { CODE_FIELDS } from './code-index-fields';
import { CODE_KINDS, CodeKind, extractCodes } from './code-query';
import { restrictToSellable } from './sellable-filter';

export interface CodeScope {
    kind: CodeKind;
    codes: string[];
}

export interface CodeQueryInput {
    term?: string | null;
    codeScope?: CodeScope;
}

interface EsBoolQuery {
    bool: { filter: unknown[]; must?: unknown[]; must_not?: unknown[] };
}

export const FULL_TEXT_FIELDS = [
    'sku^5',
    'product-oemCodes^4',
    'productName^3',
    'product-fullName^2',
    'productVariantName^2',
    'description^1',
];

// An exact hit scores above a prefix hit; separators are already stripped on both sides.
function codePredicate(kind: CodeKind, codes: string[]): unknown {
    const field = CODE_FIELDS[kind];
    return {
        bool: {
            minimum_should_match: 1,
            should: codes.flatMap(code => [
                { term: { [field]: { value: code, boost: 10 } } },
                { prefix: { [field]: { value: code } } },
            ]),
        },
    };
}

// Disjoint groups: a kind excludes every higher-priority kind, so a product shows in exactly one.
function mapGroupQuery(query: EsBoolQuery, scope: CodeScope): EsBoolQuery {
    query.bool.must = [codePredicate(scope.kind, scope.codes)];
    query.bool.must_not = CODE_KINDS.slice(0, CODE_KINDS.indexOf(scope.kind)).map(kind =>
        codePredicate(kind, scope.codes),
    );
    return query;
}

export function mapSearchQuery(
    query: EsBoolQuery,
    input: CodeQueryInput,
    enabledOnly: boolean,
): EsBoolQuery {
    restrictToSellable(query, enabledOnly);
    if (input.codeScope) return mapGroupQuery(query, input.codeScope);
    if (!input.term) return query;
    const codes = extractCodes(input.term);
    if (codes.length > 0) {
        query.bool.must_not = CODE_KINDS.map(kind => codePredicate(kind, codes));
    }
    query.bool.must = [
        {
            multi_match: {
                query: input.term,
                type: 'most_fields',
                fuzziness: 'AUTO',
                fields: FULL_TEXT_FIELDS,
            },
        },
    ];
    return query;
}

// Groups rank by relevance (exact before prefix) then product id; other searches keep their sort.
export function mapSearchSort(
    sort: ElasticSearchSortInput,
    input: CodeQueryInput,
): ElasticSearchSortInput {
    return input.codeScope
        ? [{ _score: { order: 'desc' } }, { productId: { order: 'asc' } }]
        : sort;
}
