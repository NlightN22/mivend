import { Injectable } from '@nestjs/common';
import { Collection, FacetValue, ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { getRawManyBounded } from 'shared';
import { In } from 'typeorm';

import { categorySlugsOf, hiddenFacetValueIds } from './hidden-category-facet-values';

@Injectable()
export class HiddenCategoryFacetValuesService {
    constructor(private connection: TransactionalConnection) {}

    async findHiddenIds(ctx: RequestContext, facetValueIds: ID[]): Promise<Set<string>> {
        if (facetValueIds.length === 0) return new Set();
        const rows = await this.connection
            .getRepository(ctx, FacetValue)
            .find({ where: { id: In(facetValueIds) }, relations: ['facet'] });
        const refs = rows.map(r => ({ id: r.id, code: r.code, facetCode: r.facet.code }));
        const slugs = categorySlugsOf(refs);
        if (slugs.length === 0) return new Set();
        // At most one row per slug and language; 10x slugs covers the language count.
        const hidden = await getRawManyBounded<{ slug: string }>(
            this.connection
                .getRepository(ctx, Collection)
                .createQueryBuilder('collection')
                .innerJoin('collection.translations', 'translations')
                .select('translations.slug', 'slug')
                .where('collection.isPrivate = :isPrivate', { isPrivate: true })
                .andWhere('translations.slug IN (:...slugs)', { slugs }),
            slugs.length * 10,
        );
        return hiddenFacetValueIds(refs, new Set(hidden.map(h => h.slug)));
    }

    async findPrivateCollectionIds(ctx: RequestContext, collectionIds: ID[]): Promise<Set<string>> {
        if (collectionIds.length === 0) return new Set();
        const rows = await this.connection
            .getRepository(ctx, Collection)
            .find({ where: { id: In(collectionIds), isPrivate: true }, select: { id: true } });
        return new Set(rows.map(r => String(r.id)));
    }
}
