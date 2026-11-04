import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';
import { ElasticsearchService } from '@vendure/elasticsearch-plugin/lib/src/elasticsearch.service';

import { CODE_GROUP_LIMIT } from './query-mapper';
import { CodeKind, extractCodes, skuMatchReasons } from './code-query';
import type { CodeScope } from './code-match-query';

export interface CodeMatches {
    items: Array<Record<string, unknown>>;
    total: number;
}

@Injectable()
export class InternalCodeMatchesService {
    constructor(private moduleRef: ModuleRef) {}

    async find(
        ctx: RequestContext,
        input: SearchInput,
        kind: CodeKind,
        enabledOnly: boolean,
    ): Promise<CodeMatches | null> {
        const codes = extractCodes(input.term ?? '');
        if (codes.length === 0) return null;
        const elasticsearch = this.moduleRef.get(ElasticsearchService, { strict: false });
        const scope: CodeScope = { kind, codes };
        // Same filters as the full-text search; only the term is replaced by the code predicate.
        const scoped = {
            ...input,
            term: '',
            sort: undefined,
            groupByProduct: true,
            groupBySKU: false,
            skip: 0,
            take: CODE_GROUP_LIMIT,
            codeScope: scope,
        } as SearchInput;
        const firstPage = (input.skip ?? 0) === 0 && input.take !== 0;
        if (!firstPage) {
            const total = await elasticsearch.totalHits(ctx, scoped, enabledOnly);
            return total > 0 ? { items: [], total } : null;
        }
        const { items, totalItems } = await elasticsearch.search(ctx, scoped, enabledOnly);
        if (totalItems === 0) return null;
        return {
            total: totalItems,
            items: items.map(item => withMatchReasons(item, kind, codes)),
        };
    }
}

// Only the article is on the hit; part-number and manufacturer-code hits carry no reasons.
function withMatchReasons(
    item: { sku: string },
    kind: CodeKind,
    codes: string[],
): Record<string, unknown> {
    if (kind !== 'sku') return { ...item };
    const reasons = skuMatchReasons(item.sku, codes);
    return reasons.length > 0 ? { ...item, matchReasons: reasons } : { ...item };
}
