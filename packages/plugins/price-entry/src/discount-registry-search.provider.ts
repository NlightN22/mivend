import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Permission } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { PriceTypeAccessService } from '@mivend/plugin-access-control';
import { StaffSearchRegistry, type GlobalSearchHit } from '@mivend/plugin-staff-search';

import { DiscountRegistryService } from './discount-registry.service';

export const DISCOUNT_SEARCH_KIND = 'discount';

// Goes through the registry list's own method with the caller's allowed price types, like discountRegistryPage.
@Injectable()
export class DiscountRegistrySearchProvider implements OnApplicationBootstrap {
    constructor(
        private readonly registry: StaffSearchRegistry,
        private readonly entries: DiscountRegistryService,
        private readonly priceTypeAccess: PriceTypeAccessService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register({
            kind: DISCOUNT_SEARCH_KIND,
            position: 50,
            permissions: [Permission.ReadCatalog],
            search: (ctx, term, limit) => this.search(ctx, term, limit),
        });
    }

    async search(ctx: RequestContext, term: string, limit: number): Promise<GlobalSearchHit[]> {
        const { items } = await this.entries.findAllPaginated(ctx, {
            take: limit,
            search: term,
            allowedPriceTypeCodes: await this.priceTypeAccess.allowedCodes(ctx),
        });
        return items.map(e => ({
            id: String(e.id),
            number: e.number,
            title: `${e.priceTypeCode} ${e.percent}%`,
            subtitle: e.customerNamesForSearch ?? null,
            status: e.status,
            counterpartyId: null,
        }));
    }
}
