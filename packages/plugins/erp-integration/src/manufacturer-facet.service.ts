import { Injectable } from '@nestjs/common';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { Facet, FacetService, FacetValueService, RequestContext } from '@vendure/core';

export const MANUFACTURER_FACET_CODE = 'manufacturer';

// Mirrors each Manufacturer as a FacetValue (code = ERP GUID) so the storefront filter sidebar
// can render it through the standard SearchResponse.facetValues. Not assigned to variants:
// membership is answered by the external search backend, not by Vendure's own index.
@Injectable()
export class ManufacturerFacetService {
    constructor(
        private facetService: FacetService,
        private facetValueService: FacetValueService,
    ) {}

    async ensureValue(ctx: RequestContext, externalId: string, name: string | null): Promise<void> {
        const facet = await this.ensureFacet(ctx);
        const values = await this.facetValueService.findByFacetId(ctx, facet.id);
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
