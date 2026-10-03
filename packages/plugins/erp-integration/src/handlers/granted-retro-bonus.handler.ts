import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { GrantedRetroBonusService } from '@mivend/plugin-retro-bonus';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationGrantedRetroBonusHandler';

const optionalString = (value: unknown): string | null => (value != null ? String(value) : null);

// Applies `granted-retro-bonus` (issue #106) into an append-only GrantedRetroBonus feed — the
// stream never signals removal (isDeleted is envelope-only), so there is no tombstone branch.
@Injectable()
export class GrantedRetroBonusStreamHandler implements InboundStreamHandler {
    constructor(private readonly grantedRetroBonusService: GrantedRetroBonusService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const version = String(payload.version ?? '');
        const sourceDocumentErpId = String(payload.sourceDocumentId ?? '');
        const sourceCounterpartyErpId = String(payload.sourceCounterpartyId ?? '');
        const recipientCounterpartyErpId = String(payload.recipientCounterpartyId ?? '');
        const productErpId = String(payload.productId ?? '');
        const percent = Number(payload.percent ?? NaN);
        const quantity = Number(payload.quantity ?? NaN);
        const amount = Number(payload.amount ?? NaN);
        if (
            !entityId ||
            !version ||
            !sourceDocumentErpId ||
            !sourceCounterpartyErpId ||
            !recipientCounterpartyErpId ||
            !productErpId ||
            !Number.isFinite(percent) ||
            !Number.isFinite(quantity) ||
            !Number.isFinite(amount)
        ) {
            Logger.warn(
                `granted-retro-bonus ${entityId}: missing/invalid required field, skipping`,
                loggerCtx,
            );
            return;
        }

        await this.grantedRetroBonusService.upsert(ctx, {
            erpId: entityId,
            sourceDocumentErpId,
            sourceCounterpartyErpId,
            recipientCounterpartyErpId,
            productErpId,
            discountDocumentErpId: optionalString(payload.discountDocumentId),
            operationKind: optionalString(payload.operationKind),
            accrualKind: optionalString(payload.accrualKind),
            percent,
            quantity,
            amount,
            orderErpId: optionalString(payload.orderEntityId),
            sourceVersion: version,
        });
    }
}
