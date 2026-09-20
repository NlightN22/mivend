import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationCounterpartyHandler';

// Applies Integration Service's `counterparty` stream (CounterpartyChanged, 1C's "Контрагент",
// company.customers.events.v1.counterparty-changed). Issue #104: this stream only carries
// name/isActive/isDeleted/managerId(s) — never creditLimit/creditBalance/paymentDelayDays/
// priceType/inn/departmentId/branchId/erpGroupLabel, which stay erp-import's own richer REST
// record (see CounterpartyService.upsertActiveState's own comment — same shape as #88's
// organization gap). manager_id/manager_ids deliberately not read here: Counterparty.
// assignedManagerId is a Vendure Administrator.id, and there is no erpId↔Administrator mapping
// anywhere in mivend yet — blocked on #109, tracked there, not a trivial "read the field" case.
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
        // bool zero-value omission). isDeleted folds in the same way every sibling handler does.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        await this.counterpartyService.upsertActiveState(ctx, entityId, name, isActive);
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
