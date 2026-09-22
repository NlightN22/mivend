import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    TaxCategory,
    TaxCategoryService,
    TaxRateService,
    TransactionalConnection,
} from '@vendure/core';

import { TaxZoneService } from './tax-zone.service';
import { VAT_PLACEHOLDER_RATE_VALUE, loggerCtx } from './types';

// Issue #141: persistence-only counterpart to vat-code-resolver.ts's pure 'auto-create'
// resolution — a recognized-but-unmapped or never-seen-before VAT code gets its own TaxCategory
// on the spot, plus a placeholder 0% TaxRate on the default Zone. Safe specifically because
// pricesIncludeTax is enforced true (see kafka-consumer-bootstrap.service.ts) — an unresolved
// rate only skews internal reporting, never what the customer pays. Find-or-create is idempotent
// by design: two ProductChanged events for the same never-seen code racing each other both land
// on the same TaxCategory row (unique-by-erpVatCode lookup, no upsert-on-conflict needed since
// this plugin's inbox processes one stream serially — see integration-inbox-processor.service.ts).
@Injectable()
export class TaxCategoryAutoCreateService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly taxCategoryService: TaxCategoryService,
        private readonly taxRateService: TaxRateService,
        private readonly taxZoneService: TaxZoneService,
    ) {}

    async findByErpVatCode(ctx: RequestContext, erpVatCode: string): Promise<TaxCategory | null> {
        const repo = this.connection.getRepository(ctx, TaxCategory);
        return repo.findOne({ where: { customFields: { erpVatCode } } });
    }

    async findOrCreate(
        ctx: RequestContext,
        erpVatCode: string,
        rawCode: string,
    ): Promise<TaxCategory> {
        const existing = await this.findByErpVatCode(ctx, erpVatCode);
        if (existing) return existing;

        const created = await this.taxCategoryService.create(ctx, {
            name: rawCode,
            isDefault: false,
            customFields: { erpVatCode },
        });

        const zone = await this.taxZoneService.findOrCreateDefaultZone(ctx);
        await this.taxRateService.create(ctx, {
            name: `${rawCode} (auto, ${zone.name})`,
            enabled: true,
            value: VAT_PLACEHOLDER_RATE_VALUE,
            categoryId: created.id,
            zoneId: zone.id,
        });

        Logger.log(
            `Auto-created TaxCategory + placeholder TaxRate for VAT code '${erpVatCode}' (raw '${rawCode}')`,
            loggerCtx,
        );
        return created;
    }
}
