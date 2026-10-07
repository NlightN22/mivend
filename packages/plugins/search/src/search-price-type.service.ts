import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import { PriceType } from '@mivend/plugin-customer-pricing';
import { PriceEntryService } from '@mivend/plugin-price-entry';

// Resolves the PriceType.externalId search-service prices by: the viewer's effective type, else
// the branch default (same order as PriceResolutionService). Null means "omit the parameter".
@Injectable()
export class SearchPriceTypeService {
    constructor(
        private priceEntryService: PriceEntryService,
        private branchSettingsService: BranchSettingsService,
        private connection: TransactionalConnection,
    ) {}

    async resolveExternalId(ctx: RequestContext): Promise<string | null> {
        const repo = this.connection.getRepository(ctx, PriceType);
        const code = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (code) {
            const own = await repo.findOne({ where: { code } });
            if (own?.externalId) return own.externalId;
        }
        const settings = await this.branchSettingsService.resolveEffective(ctx);
        if (!settings) return null;
        const fallback = await repo.findOne({ where: { id: settings.defaultPriceTypeId } });
        return fallback?.externalId ?? null;
    }
}
