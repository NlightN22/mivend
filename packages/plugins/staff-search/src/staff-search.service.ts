import { Injectable } from '@nestjs/common';
import { Logger, RequestContext } from '@vendure/core';

import { clampSearchLimit, normalizeSearchTerm } from './search-term';
import { StaffSearchRegistry } from './staff-search.registry';
import { loggerCtx, type GlobalSearchGroup, type GlobalSearchProvider } from './types';

@Injectable()
export class StaffSearchService {
    constructor(private readonly registry: StaffSearchRegistry) {}

    async search(
        ctx: RequestContext,
        term: string,
        limitPerKind?: number | null,
    ): Promise<GlobalSearchGroup[]> {
        const text = normalizeSearchTerm(term);
        if (text === null) return [];
        const limit = clampSearchLimit(limitPerKind);
        const allowed = this.registry.all().filter(p => ctx.userHasPermissions(p.permissions));
        const groups = await Promise.all(allowed.map(p => this.run(ctx, p, text, limit)));
        return groups.filter((g): g is GlobalSearchGroup => g !== null && g.items.length > 0);
    }

    private async run(
        ctx: RequestContext,
        provider: GlobalSearchProvider,
        term: string,
        limit: number,
    ): Promise<GlobalSearchGroup | null> {
        try {
            const items = await provider.search(ctx, term, limit);
            return { kind: provider.kind, items: items.slice(0, limit) };
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            Logger.error(
                `Global search failed for kind "${provider.kind}": ${err.message}`,
                loggerCtx,
                err.stack,
            );
            return null;
        }
    }
}
