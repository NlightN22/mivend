import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import {
    Facet,
    FacetService,
    FacetValueService,
    Logger,
    ProcessContext,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { characteristicFacetCode } from 'shared';

import { ProductCharacteristic } from './entities/product-characteristic.entity';
import type { ProductCharacteristicRow } from './product-characteristics-mapper';
import { loggerCtx } from './types';

const MANUFACTURER_KEY = 'Производитель';

// Mirrors each characteristic key as a Facet and each normalized value as a FacetValue so the
// storefront filter sidebar renders them through SearchResponse.facetValues. Not assigned to
// variants: membership and counts come from the external search backend.
@Injectable()
export class CharacteristicFacetService implements OnApplicationBootstrap {
    private known = new Map<string, Set<string>>();

    constructor(
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private processContext: ProcessContext,
    ) {}

    // Heals characteristics ingested before the facets existed; server process only.
    async onApplicationBootstrap(): Promise<void> {
        if (!this.processContext.isServer) return;
        try {
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const rows = await this.connection
                .getRepository(ctx, ProductCharacteristic)
                .createQueryBuilder('c')
                .select(['c.key AS key', 'c.normalizedValue AS "normalizedValue"'])
                .distinct(true)
                .getRawMany<Pick<ProductCharacteristicRow, 'key' | 'normalizedValue'>>();
            await this.ensureValues(ctx, rows as ProductCharacteristicRow[]);
        } catch (err) {
            Logger.error(`characteristic facet backfill failed: ${String(err)}`, loggerCtx);
        }
    }

    async ensureValues(ctx: RequestContext, rows: ProductCharacteristicRow[]): Promise<void> {
        for (const [key, values] of this.missingByKey(rows)) {
            const facet = await this.ensureFacet(ctx, key);
            const known = await this.knownValues(ctx, facet, key);
            for (const value of values) {
                if (known.has(value)) continue;
                await this.facetValueService.create(ctx, facet as never, {
                    facetId: String(facet.id),
                    code: value,
                    translations: [{ languageCode: LanguageCode.en, name: value }],
                });
                known.add(value);
            }
        }
    }

    private missingByKey(rows: ProductCharacteristicRow[]): Map<string, Set<string>> {
        const result = new Map<string, Set<string>>();
        for (const row of rows) {
            if (row.key === MANUFACTURER_KEY || !row.normalizedValue) continue;
            const known = this.known.get(row.key);
            for (const value of parseNormalized(row.normalizedValue)) {
                if (known?.has(value)) continue;
                result.set(row.key, (result.get(row.key) ?? new Set()).add(value));
            }
        }
        return result;
    }

    private async knownValues(
        ctx: RequestContext,
        facet: Facet,
        key: string,
    ): Promise<Set<string>> {
        const cached = this.known.get(key);
        if (cached) return cached;
        const existing = await this.facetValueService.findByFacetId(ctx, facet.id);
        const set = new Set(existing.map(v => v.code));
        this.known.set(key, set);
        return set;
    }

    private async ensureFacet(ctx: RequestContext, key: string): Promise<Facet> {
        const code = characteristicFacetCode(key);
        const existing = await this.facetService.findByCode(ctx, code, LanguageCode.en);
        if (existing) return existing;
        return this.facetService.create(ctx, {
            code,
            isPrivate: false,
            translations: [{ languageCode: LanguageCode.en, name: key }],
        });
    }
}

function parseNormalized(json: string): string[] {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string' && v !== '')
        : [];
}
