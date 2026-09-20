import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationCounterpartyCreditBalanceHandler';

// Applies Integration Service's `counterparty-credit-balance` stream
// (CounterpartyCreditBalanceChanged, search-platform#129) — a register-driven stream
// (AccumulationRegister_ВзаиморасчетыСКонтрагентами) independent of CounterpartyChanged's own
// catalog-change trigger; creditBalance can change without any other Counterparty field changing,
// and vice versa. entityId is the register entry's own key, not the counterparty's erpId — the
// join key to Counterparty is payload.counterpartyId.
@Injectable()
export class CounterpartyCreditBalanceStreamHandler implements InboundStreamHandler {
    constructor(private readonly counterpartyService: CounterpartyService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const counterpartyId = payload.counterpartyId ? String(payload.counterpartyId) : null;
        if (!counterpartyId) {
            Logger.warn(
                `counterparty-credit-balance ${entityId}: missing counterpartyId, skipping`,
                loggerCtx,
            );
            return;
        }
        // A deleted register entry is not the same as "balance is now zero" — 1C's own retraction
        // of a settlement entry doesn't imply the counterparty's real balance became zero, so this
        // stays a logged no-op rather than fabricating a zero balance.
        if (payload.isDeleted === true) {
            Logger.verbose(
                `counterparty-credit-balance ${entityId}: deleted register entry, skipping`,
                loggerCtx,
            );
            return;
        }
        const balance =
            typeof payload.balance === 'number' ? payload.balance : Number(payload.balance);
        if (!Number.isFinite(balance)) {
            Logger.warn(
                `counterparty-credit-balance ${entityId}: missing/invalid balance, skipping`,
                loggerCtx,
            );
            return;
        }
        await this.counterpartyService.updateCreditBalance(ctx, counterpartyId, balance);
    }
}
