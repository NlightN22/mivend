import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { GrantedRetroBonusService } from '@mivend/plugin-retro-bonus';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationGrantedRetroBonusHandler';

const optionalString = (value: unknown): string | null => (value != null ? String(value) : null);

// Applies `granted-retro-bonus` (issue #106) into an append-only GrantedRetroBonus feed — the
// is_deleted=true is a 1C unposting tombstone (all other fields empty), soft-deleting the row.
@Injectable()
export class GrantedRetroBonusStreamHandler implements InboundStreamHandler {
    constructor(private readonly grantedRetroBonusService: GrantedRetroBonusService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        if (payload.isDeleted === true) {
            await this.grantedRetroBonusService.remove(
                ctx,
                entityId,
                String(payload.version ?? ''),
            );
            return;
        }
        const version = String(payload.version ?? '');
        const sourceDocumentErpId = String(payload.sourceDocumentId ?? '');
        const sourceCounterpartyErpId = String(payload.sourceCounterpartyId ?? '');
        const recipientCounterpartyErpId = String(payload.recipientCounterpartyId ?? '');
        const productErpId = String(payload.productId ?? '');
        // Plain proto3 doubles: a legitimate 0 is omitted from the payload, so absent means 0.
        const percent = Number(payload.percent ?? 0);
        const quantity = Number(payload.quantity ?? 0);
        const amount = Number(payload.amount ?? 0);
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
