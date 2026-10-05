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
import {
    MANUFACTURER_NAME_ATTRIBUTE_KEY,
    type ProductCharacteristicRow,
} from './product-characteristics-mapper';
import { loggerCtx } from './types';

const KNOWN_VALUES_TTL_MS = 60_000;

// Mirrors characteristic keys as Facets and normalized values as FacetValues for the filter
// sidebar; membership and counts come from the external search backend, not variants.
@Injectable()
export class CharacteristicFacetService implements OnApplicationBootstrap {
    private known = new Map<string, { values: Set<string>; expiresAt: number }>();

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
            await this.connection.withTransaction(ctx, async txCtx => {
                // FacetService.create suffixes a clashing code (-2), so creation must be serialized.
                await this.connection
                    .getRepository(txCtx, ProductCharacteristic)
                    .query('select pg_advisory_xact_lock(hashtext($1))', [
                        `characteristic-facet:${key}`,
                    ]);
                const facet = await this.ensureFacet(txCtx, key);
                const existing = await this.facetValueService.findByFacetId(txCtx, facet.id);
                const known = new Set(existing.map(v => v.code));
                for (const value of values) {
                    if (known.has(value)) continue;
                    await this.facetValueService.create(txCtx, facet as never, {
                        facetId: String(facet.id),
                        code: value,
                        translations: [{ languageCode: LanguageCode.en, name: value }],
                    });
                    known.add(value);
                }
                this.known.set(key, { values: known, expiresAt: Date.now() + KNOWN_VALUES_TTL_MS });
            });
        }
    }

    private missingByKey(rows: ProductCharacteristicRow[]): Map<string, Set<string>> {
        const result = new Map<string, Set<string>>();
        const now = Date.now();
        for (const row of rows) {
            if (row.key === MANUFACTURER_NAME_ATTRIBUTE_KEY || !row.normalizedValue) continue;
            const cached = this.known.get(row.key);
            const known = cached && cached.expiresAt > now ? cached.values : undefined;
            for (const value of parseNormalized(row.normalizedValue)) {
                if (known?.has(value)) continue;
                result.set(row.key, (result.get(row.key) ?? new Set()).add(value));
            }
        }
        return result;
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
