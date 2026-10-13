import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { SettlementBalanceService } from '@mivend/plugin-settlement';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { parseTimestamp } from './settlement-payload';

// Applies `settlement-balance` (#224): closing_balance is authoritative and is never checked
// against the documents (a corrected balance may legitimately differ until the next movement).
@Injectable()
export class SettlementBalanceStreamHandler implements InboundStreamHandler {
    constructor(private readonly balanceService: SettlementBalanceService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const version = String(payload.version ?? '');
        const organizationErpId = String(payload.organizationId ?? '');
        const counterpartyErpId = String(payload.counterpartyId ?? '');
        const contractErpId = String(payload.contractId ?? '');
        // Plain proto3 doubles: a legitimate zero is omitted, so absent means 0.
        const openingBalance = Number(payload.openingBalance ?? 0);
        const closingBalance = Number(payload.closingBalance ?? 0);
        if (
            !entityId ||
            !version ||
            !organizationErpId ||
            !counterpartyErpId ||
            !contractErpId ||
            !Number.isFinite(openingBalance) ||
            !Number.isFinite(closingBalance)
        ) {
            return inboundNoop(`settlement-balance ${entityId}: missing/invalid field, skipping`);
        }

        const result = await this.balanceService.apply(ctx, {
            key: entityId,
            version,
            isDeleted: payload.isDeleted === true,
            organizationErpId,
            counterpartyErpId,
            contractErpId,
            currency: String(payload.currency ?? ''),
            openingDate: parseTimestamp(payload.openingDate),
            openingBalance,
            closingBalance,
        });
        if (result === 'stale') {
            return inboundNoop(`settlement-balance ${entityId}: version not newer than stored`);
        }
        if (result === 'unknown-deleted') {
            return inboundNoop(`settlement-balance ${entityId}: deletion of an unknown balance`);
        }
        return inboundApplied();
    }
}
