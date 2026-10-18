import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { BranchSettingsService, PriceTypeAccessService } from '@mivend/plugin-access-control';
import { PriceType } from '@mivend/plugin-customer-pricing';
import { PriceEntryService } from '@mivend/plugin-price-entry';

// Resolves the PriceType.externalId search-service prices by: the viewer's effective type, else
// the branch default (same order as PriceResolutionService). Null means "omit the parameter".
@Injectable()
export class SearchPriceTypeService {
    constructor(
        private priceEntryService: PriceEntryService,
        private branchSettingsService: BranchSettingsService,
        private priceTypeAccess: PriceTypeAccessService,
        private connection: TransactionalConnection,
    ) {}

    async resolveExternalId(ctx: RequestContext): Promise<string | null> {
        const repo = this.connection.getRepository(ctx, PriceType);
        const code = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (code) {
            const own = await repo.findOne({ where: { code } });
            if (own?.externalId && (await this.isVisible(ctx, own))) return own.externalId;
        }
        const settings = await this.branchSettingsService.resolveEffective(ctx);
        if (!settings) return null;
        const fallback = await repo.findOne({ where: { id: settings.defaultPriceTypeId } });
        return fallback?.externalId && (await this.isVisible(ctx, fallback))
            ? fallback.externalId
            : null;
    }

    // Staff searching the catalog never price by a type they may not see; a customer's own type is theirs.
    private async isVisible(ctx: RequestContext, type: PriceType): Promise<boolean> {
        if (ctx.apiType !== 'admin') return true;
        return this.priceTypeAccess.isCodeAllowed(ctx, type.code);
    }
}
