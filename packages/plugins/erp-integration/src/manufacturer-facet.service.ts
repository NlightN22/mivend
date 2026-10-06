import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    Facet,
    FacetService,
    FacetValue,
    FacetValueService,
    Logger,
    ProcessContext,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';

import { Manufacturer } from './entities/manufacturer.entity';
import { loggerCtx } from './types';

export const MANUFACTURER_FACET_CODE = 'manufacturer';
const KNOWN_TTL_MS = 10 * 60_000;

// Mirrors each Manufacturer as a FacetValue (code = ERP GUID) so the storefront filter sidebar
// can render it through the standard SearchResponse.facetValues. Not assigned to variants:
// membership is answered by the external search backend, not by Vendure's own index.
@Injectable()
export class ManufacturerFacetService implements OnApplicationBootstrap {
    // Loading every manufacturer value per product event dominated the inbox's CPU time.
    private known?: { values: Map<string, { id: ID; name: string }>; expiresAt: number };

    constructor(
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private processContext: ProcessContext,
    ) {}

    // Heals manufacturers that predate the facet; server process only, so the worker cannot race it.
    async onApplicationBootstrap(): Promise<void> {
        if (!this.processContext.isServer) return;
        try {
            const ctx = await this.requestContextService.create({ apiType: 'admin' });
            const manufacturers = await this.connection.getRepository(ctx, Manufacturer).find();
            const facet = await this.ensureFacet(ctx);
            const values = await this.facetValueService.findByFacetId(ctx, facet.id);
            for (const m of manufacturers)
                await this.syncValue(ctx, facet, values, m.externalId, m.name);
        } catch (err) {
            Logger.error(`manufacturer facet backfill failed: ${String(err)}`, loggerCtx);
        }
    }

    async ensureValue(ctx: RequestContext, externalId: string, name: string | null): Promise<void> {
        const facet = await this.ensureFacet(ctx);
        if (!this.known || this.known.expiresAt <= Date.now()) {
            const values = await this.facetValueService.findByFacetId(ctx, facet.id);
            this.known = {
                values: new Map(values.map(v => [v.code, { id: v.id, name: v.name }])),
                expiresAt: Date.now() + KNOWN_TTL_MS,
            };
        }
        const current = this.known.values.get(externalId);
        if (current && (!name || current.name === name)) return;
        if (!current) {
            const created = await this.facetValueService.create(ctx, facet as never, {
                facetId: String(facet.id),
                code: externalId,
                translations: [{ languageCode: LanguageCode.en, name: name ?? externalId }],
            });
            this.known.values.set(externalId, { id: created.id, name: name ?? externalId });
            return;
        }
        await this.facetValueService.update(ctx, {
            id: current.id,
            translations: [{ languageCode: LanguageCode.en, name: name as string }],
        });
        current.name = name as string;
    }

    private async syncValue(
        ctx: RequestContext,
        facet: Facet,
        values: FacetValue[],
        externalId: string,
        name: string | null,
    ): Promise<void> {
        const existing = values.find(v => v.code === externalId);
        if (!existing) {
            await this.facetValueService.create(ctx, facet as never, {
                facetId: String(facet.id),
                code: externalId,
                translations: [{ languageCode: LanguageCode.en, name: name ?? externalId }],
            });
            return;
        }
        if (name && existing.name !== name) {
            await this.facetValueService.update(ctx, {
                id: existing.id,
                translations: [{ languageCode: LanguageCode.en, name }],
            });
        }
    }

    private async ensureFacet(ctx: RequestContext): Promise<Facet> {
        const existing = await this.facetService.findByCode(
            ctx,
            MANUFACTURER_FACET_CODE,
            LanguageCode.en,
        );
        if (existing) return existing;
        return this.facetService.create(ctx, {
            code: MANUFACTURER_FACET_CODE,
            isPrivate: false,
            translations: [{ languageCode: LanguageCode.en, name: 'Manufacturer' }],
        });
    }
}
