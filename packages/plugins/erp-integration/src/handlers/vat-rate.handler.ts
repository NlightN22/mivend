import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TaxRate, TaxRateService, TransactionalConnection } from '@vendure/core';

import { ProformaRequeueService } from '@mivend/plugin-documents';

import { TaxCategoryAutoCreateService } from '../tax-category-auto-create.service';
import { TaxZoneService } from '../tax-zone.service';
import { toErpVatCode } from '../vat-code-resolver';
import { loggerCtx } from '../types';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Percent absent means auto-registered, not confirmed: never coerce it to 0, just log and return.
// is_deleted only logs: a soft upstream flag must not auto-delete live tax config.
@Injectable()
export class VatRateStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly taxCategoryAutoCreateService: TaxCategoryAutoCreateService,
        private readonly taxZoneService: TaxZoneService,
        private readonly taxRateService: TaxRateService,
        private readonly proformaRequeueService: ProformaRequeueService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const rawCode = String(payload.code ?? '');
        if (!rawCode) {
            return inboundNoop(`vat-rate ${entityId}: missing code, skipping`);
        }

        if (payload.isDeleted === true) {
            return inboundNoop(
                `vat-rate ${entityId}: code '${rawCode}' marked deleted upstream — NOT deleting the` +
                    ' TaxRate/TaxCategory, review manually if this VAT code is genuinely retired',
            );
        }

        const percent = typeof payload.percent === 'number' ? payload.percent : undefined;
        if (percent === undefined) {
            return inboundNoop(
                `vat-rate ${entityId}: code '${rawCode}' has no percent yet (auto-registered, not` +
                    ' confirmed), skipping TaxRate value upsert',
            );
        }

        const erpVatCode = toErpVatCode(rawCode);
        // Keyed by VAT code, not product: arriving before any product uses the code is not a race.
        // No cross-entity lookup, so it creates its own TaxCategory if missing and proceeds.
        const taxCategory = await this.taxCategoryAutoCreateService.findOrCreate(
            ctx,
            erpVatCode,
            rawCode,
        );
        const zone = await this.taxZoneService.findOrCreateDefaultZone(ctx);

        const repo = this.connection.getRepository(ctx, TaxRate);
        const existingRate = await repo.findOne({
            where: { category: { id: taxCategory.id }, zone: { id: zone.id } },
        });

        if (existingRate) {
            await this.taxRateService.update(ctx, {
                id: existingRate.id,
                name: `${rawCode} (${zone.name})`,
                value: percent,
            });
        } else {
            await this.taxRateService.create(ctx, {
                name: `${rawCode} (${zone.name})`,
                enabled: true,
                value: percent,
                categoryId: taxCategory.id,
                zoneId: zone.id,
            });
        }

        await this.proformaRequeueService.requeueForUnconfirmedVat(ctx, taxCategory.name);

        Logger.verbose(
            `Upserted TaxRate for erpVatCode=${erpVatCode} zone=${zone.name} value=${percent}`,
            loggerCtx,
        );
        return inboundApplied();
    }
}
