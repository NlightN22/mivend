import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { TradingPointService } from '@mivend/plugin-counterparty';

import { MissingDependencyError } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPointOfSaleHandler';

// Applies the `point-of-sale` stream (issue #100) — TradingPoint's live counterpart. Field
// accounting: docs/ai/erp-streams-map.md's `point-of-sale` row.
@Injectable()
export class PointOfSaleStreamHandler implements InboundStreamHandler {
    constructor(private readonly tradingPointService: TradingPointService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = payload.name ? String(payload.name) : null;
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        if (!name) {
            Logger.verbose(
                `point-of-sale ${entityId}: no name (deletion tombstone) — skipping, ` +
                    'nothing to create/update without a name',
                loggerCtx,
            );
            return;
        }

        const counterpartyErpId = String(payload.counterpartyId ?? '');
        const counterparty = await this.tradingPointService.findCounterpartyRefByErpId(
            ctx,
            counterpartyErpId,
        );
        if (!counterparty) {
            throw new MissingDependencyError(
                `point-of-sale ${entityId}: counterparty erpId=${counterpartyErpId} not synced yet`,
            );
        }

        await this.tradingPointService.upsertFromStream(ctx, entityId, {
            name,
            counterpartyId: counterparty.id,
            servicingBranchId: counterparty.branchId,
            isActive,
            address: payload.address !== undefined ? String(payload.address) : undefined,
            latitude: typeof payload.latitude === 'number' ? payload.latitude : undefined,
            longitude: typeof payload.longitude === 'number' ? payload.longitude : undefined,
            contactPhone:
                payload.contactPhone !== undefined ? String(payload.contactPhone) : undefined,
        });

        Logger.verbose(`Upserted trading point erpId=${entityId}`, loggerCtx);
    }
}
