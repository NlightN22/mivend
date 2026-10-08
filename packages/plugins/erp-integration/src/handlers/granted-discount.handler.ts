import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { GrantedDiscountService } from '@mivend/plugin-price-entry';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationGrantedDiscountHandler';

// Applies the `granted-discount` stream (issue #101) into plugin-price-entry's GrantedDiscount —
// full field accounting: docs/ai/erp-streams-map.md. is_deleted=true is a 1C unposting tombstone.
@Injectable()
export class GrantedDiscountStreamHandler implements InboundStreamHandler {
    constructor(private readonly grantedDiscountService: GrantedDiscountService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        if (payload.isDeleted === true) {
            const tombstoneVersion = String(payload.version ?? '');
            if (!tombstoneVersion) {
                return inboundNoop(
                    `granted-discount ${entityId}: tombstone without version, skipping`,
                );
            }
            const removed = await this.grantedDiscountService.remove(
                ctx,
                entityId,
                tombstoneVersion,
            );
            Logger.verbose(`Removed granted discount erpId=${entityId}`, loggerCtx);
            return removed
                ? inboundApplied()
                : inboundNoop(
                      `granted-discount ${entityId}: tombstone for an unknown row or older than the stored version`,
                  );
        }
        const sourceDocumentId = String(payload.sourceDocumentId ?? '');
        const counterpartyErpId = String(payload.sourceCounterpartyId ?? '');
        const productErpId = String(payload.productId ?? '');
        const discountRuleRecipientId = String(payload.discountRuleRecipientId ?? '');
        const version = String(payload.version ?? '');
        const discountAmount = Number(payload.discountAmount ?? 0);
        if (
            !sourceDocumentId ||
            !counterpartyErpId ||
            !productErpId ||
            !version ||
            !Number.isFinite(discountAmount)
        ) {
            return inboundNoop(
                `granted-discount ${entityId}: missing/invalid sourceDocumentId/` +
                    `sourceCounterpartyId/productId/version/discountAmount, skipping`,
            );
        }

        await this.grantedDiscountService.upsert(ctx, {
            erpId: entityId,
            sourceDocumentId,
            counterpartyErpId,
            productErpId,
            orderEntityId: payload.orderEntityId != null ? String(payload.orderEntityId) : null,
            discountDocumentId:
                payload.discountDocumentId != null ? String(payload.discountDocumentId) : null,
            discountRuleRecipientId,
            condition: payload.condition != null ? String(payload.condition) : null,
            discountAmount,
            sourceVersion: version,
        });
        Logger.verbose(`Upserted granted discount erpId=${entityId}`, loggerCtx);
        return inboundApplied();
    }
}
