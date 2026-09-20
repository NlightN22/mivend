import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationCounterpartyHandler';

// Applies Integration Service's `counterparty` stream (CounterpartyChanged, 1C's "Контрагент",
// company.customers.events.v1.counterparty-changed). Issue #104, verified live against
// @nlightn22/event-contracts@0.38.0 (search-platform#92/#118 — do not trust older issue comments
// claiming inn/erpGroupLabel/departmentId are unavailable; they shipped): this stream carries
// name/isActive/isDeleted/managerId(s)/inn/erpGroupLabel/departmentId — never creditLimit/
// paymentDelayDays/priceType/branchId, which stay erp-import's own richer REST record (see
// CounterpartyService.upsertActiveState's own comment). creditBalance moved to its own
// register-driven stream (search-platform#129) — see CounterpartyCreditBalanceStreamHandler.
// manager_id/manager_ids deliberately not read here: Counterparty.assignedManagerId is a Vendure
// Administrator.id, and there is no erpId↔Administrator mapping anywhere in mivend yet — blocked
// on #109, tracked there, not a trivial "read the field" case.
@Injectable()
export class CounterpartyStreamHandler implements InboundStreamHandler {
    constructor(private readonly counterpartyService: CounterpartyService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        // A deletion tombstone never carries a name — same convention confirmed for organization/
        // department. `name: null` here still lets upsertActiveState update isActive on an
        // existing row; it only refuses to fabricate a brand-new row with a blank name.
        const name = payload.name ? String(payload.name) : null;
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission — confirmed to still apply in practice for this contract
        // version's JSON encoding despite the field now being declared `optional bool` at the
        // .proto level, search-platform#110/#135). isDeleted folds in the same way every sibling
        // handler does.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        await this.counterpartyService.upsertActiveState(ctx, entityId, {
            name,
            isActive,
            // These are real optional-scalar fields (undefined = "1C didn't send this", distinct
            // from a proto3 zero-value ambiguity) — `in` checks presence explicitly rather than
            // reading `payload.inn` directly, since an intentional `null`/empty string must still
            // be applied, not treated as "leave unchanged".
            inn: 'inn' in payload ? ((payload.inn as string | null) ?? null) : undefined,
            erpGroupLabel:
                'erpGroupLabel' in payload
                    ? ((payload.erpGroupLabel as string | null) ?? null)
                    : undefined,
            departmentId:
                'departmentId' in payload
                    ? ((payload.departmentId as string | null) ?? null)
                    : undefined,
        });
        if (!name) {
            Logger.verbose(
                `counterparty ${entityId}: no name (deletion tombstone) — updated active ` +
                    `state only if a row already existed, never created one`,
                loggerCtx,
            );
            return;
        }
        Logger.verbose(`Upserted counterparty erpId=${entityId}`, loggerCtx);
    }
}
