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
        // A deleted register entry is not the same as "balance is now zero" — the ERP's own retraction
        // of a settlement entry doesn't imply the counterparty's real balance became zero, so this
        // stays a logged no-op rather than fabricating a zero balance.
        if (payload.isDeleted === true) {
            Logger.verbose(
                `counterparty-credit-balance ${entityId}: deleted register entry, skipping`,
                loggerCtx,
            );
            return;
        }
        const rawBalance =
            typeof payload.balance === 'number' ? payload.balance : Number(payload.balance);
        if (!Number.isFinite(rawBalance)) {
            Logger.warn(
                `counterparty-credit-balance ${entityId}: missing/invalid balance, skipping`,
                loggerCtx,
            );
            return;
        }
        // Counterparty.creditBalance/creditLimit are both `bigint` columns storing whole rubles,
        // not fractional minor units (see Counterparty.creditLimit's own GraphQL `Int` type and
        // erp-import's counterparty-record.dto.ts, which already sends creditLimit as a plain
        // integer) — this register-driven stream is the only balance source that ever sends a
        // fractional value (e.g. -20906.8), which previously reached `bigint` as-is and failed
        // with "invalid input syntax for type bigint" (766 dead-lettered rows in staging,
        // mivend.audit.common, 2026-09-20). Rounded to match the existing whole-ruble convention
        // — not truncated, so a balance like 100.6 doesn't silently become a materially
        // different 100.
        const balance = Math.round(rawBalance);
        await this.counterpartyService.updateCreditBalance(ctx, counterpartyId, balance);
    }
}
