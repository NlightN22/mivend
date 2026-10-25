import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { zeroNumber } from './proto-json-fields';

// Register-driven: creditBalance can change without Counterparty fields changing, and vice versa.
// entityId is the register entry's key, not counterparty erpId; join via payload.counterpartyId.
@Injectable()
export class CounterpartyCreditBalanceStreamHandler implements InboundStreamHandler {
    constructor(private readonly counterpartyService: CounterpartyService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const counterpartyId = payload.counterpartyId ? String(payload.counterpartyId) : null;
        if (!counterpartyId) {
            return inboundNoop(
                `counterparty-credit-balance ${entityId}: missing counterpartyId, skipping`,
            );
        }
        // A deleted register entry does not mean the balance is zero; ERP retraction is not a balance change.
        // So it stays a logged no-op, not a fabricated zero creditBalance.
        if (payload.isDeleted === true) {
            return inboundNoop(
                `counterparty-credit-balance ${entityId}: deleted register entry, skipping`,
            );
        }
        const rawBalance = zeroNumber(payload.balance);
        if (!Number.isFinite(rawBalance)) {
            throw new NonRetryableInboundError(
                `counterparty-credit-balance ${entityId}: invalid balance`,
            );
        }
        // creditBalance/creditLimit are whole-ruble bigint columns; this stream alone sends fractional values.
        // Round (not truncate) to whole rubles before writing, or bigint insert fails on e.g. -20906.8.
        const balance = Math.round(rawBalance);
        await this.counterpartyService.updateCreditBalance(ctx, counterpartyId, balance);
        return inboundApplied();
    }
}
