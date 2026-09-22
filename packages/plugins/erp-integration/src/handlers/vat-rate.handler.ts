import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TaxRate, TaxRateService, TransactionalConnection } from '@vendure/core';

import { TaxCategoryAutoCreateService } from '../tax-category-auto-create.service';
import { TaxZoneService } from '../tax-zone.service';
import { toErpVatCode } from '../vat-code-resolver';
import { loggerCtx } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

// Applies Integration Service's `vat-rate` stream (VatRateChanged, issue #141) — a small,
// low-cardinality reference feed (code -> zone -> percent), never product-keyed. Upserts
// TaxRate.value by (erpVatCode, zone); never touches a Product/ProductVariant.
//
// Field-by-field outcome (see docs/ai/erp-streams-map.md's `vat-rate` row and this issue's body
// for the same three-place record):
// - event_id/occurred_at/updated_at: envelope-only, no current consumer (same as every other
//   stream in this plugin).
// - entity_id: read generically by KafkaConsumerService/IntegrationInboxService for inbox
//   dedup/versioning, not read here directly.
// - version: drives the inbox's own out-of-order guard centrally (see inbound-stream-handler.ts),
//   not read here directly.
// - code: consumed — mapped via toErpVatCode (same Cyrillic->Latin table product.handler.ts
//   uses) to the TaxCategory.customFields.erpVatCode key.
// - zone: consumed only to confirm today's single-zone assumption in the log line; the actual
//   Zone row is always TaxZoneService's single default ("Russia") — no multi-zone support until a
//   real second zone exists (deliberately not built speculatively, see AGENTS.md).
// - percent: consumed when present; ABSENT is a real signal ("auto-registered, not confirmed
//   yet") and is never coerced to 0 — this handler logs and returns instead of upserting.
// - is_deleted: consumed only to log a warning. Deliberately does NOT delete/disable the
//   TaxRate/TaxCategory — deleting live tax config from an upstream flag is a decision a human
//   should make deliberately, not something to auto-apply blindly (same "never destructive on a
//   soft signal" reasoning as this plugin's non-blocking VAT-code review flags elsewhere).
@Injectable()
export class VatRateStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly taxCategoryAutoCreateService: TaxCategoryAutoCreateService,
        private readonly taxZoneService: TaxZoneService,
        private readonly taxRateService: TaxRateService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const rawCode = String(payload.code ?? '');
        if (!rawCode) {
            Logger.warn(`vat-rate ${entityId}: missing code, skipping`, loggerCtx);
            return;
        }

        if (payload.isDeleted === true) {
            Logger.warn(
                `vat-rate ${entityId}: code '${rawCode}' marked deleted upstream — NOT deleting the` +
                    ' TaxRate/TaxCategory, review manually if this VAT code is genuinely retired',
                loggerCtx,
            );
            return;
        }

        const percent = typeof payload.percent === 'number' ? payload.percent : undefined;
        if (percent === undefined) {
            Logger.log(
                `vat-rate ${entityId}: code '${rawCode}' has no percent yet (auto-registered, not` +
                    ' confirmed), skipping TaxRate value upsert',
                loggerCtx,
            );
            return;
        }

        const erpVatCode = toErpVatCode(rawCode);
        // Code-keyed, not product-keyed — a vat-rate row arriving before any product references
        // this code is not a missing-dependency race (no cross-entity lookup here), it just
        // proceeds independently and creates its own TaxCategory if needed.
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
            await this.taxRateService.update(ctx, { id: existingRate.id, value: percent });
        } else {
            await this.taxRateService.create(ctx, {
                name: `${rawCode} (${zone.name})`,
                enabled: true,
                value: percent,
                categoryId: taxCategory.id,
                zoneId: zone.id,
            });
        }

        Logger.verbose(
            `Upserted TaxRate for erpVatCode=${erpVatCode} zone=${zone.name} value=${percent}`,
            loggerCtx,
        );
    }
}
