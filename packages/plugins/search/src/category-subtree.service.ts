import { Injectable } from '@nestjs/common';
import type { SearchInput } from '@vendure/common/lib/generated-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CATEGORY_FACET_CODE, CATEGORY_SLUG_PREFIX, ctxQueryBounded } from 'shared';

import {
    expandCategoryFilters,
    visibleSubtreeFacetValueIds,
    type CategoryNodeRow,
} from './category-subtree-expansion';

const CATEGORY_TREE_CEILING = 5000;

// One bounded read of the category tree per request that carries facet filters.
export const CATEGORY_TREE_SQL = `SELECT col.id AS "collectionId", col."parentId" AS "parentId",
    col."isPrivate" AS "isPrivate", fv.id AS "facetValueId"
    FROM collection col
    JOIN collection_translation ct ON ct."baseId" = col.id AND ct.slug LIKE '${CATEGORY_SLUG_PREFIX}%'
    LEFT JOIN facet f ON f.code = '${CATEGORY_FACET_CODE}'
    LEFT JOIN facet_value fv ON fv."facetId" = f.id AND ct.slug = '${CATEGORY_SLUG_PREFIX}' || fv.code`;

// The external backend matches a category filter against the whole subtree; the index holds only a
// product's own category value, so the internal backend widens the filter to visible descendants.
@Injectable()
export class CategorySubtreeService {
    constructor(private connection: TransactionalConnection) {}

    async expand(ctx: RequestContext, input: SearchInput): Promise<SearchInput> {
        const filters = input.facetValueFilters;
        if (!filters?.length) return input;
        const rows = await ctxQueryBounded<CategoryNodeRow>(
            this.connection,
            ctx,
            CATEGORY_TREE_SQL,
            [],
            CATEGORY_TREE_CEILING,
        );
        const descendantsOf = visibleSubtreeFacetValueIds(rows);
        return { ...input, facetValueFilters: expandCategoryFilters(filters, descendantsOf) };
    }
}
