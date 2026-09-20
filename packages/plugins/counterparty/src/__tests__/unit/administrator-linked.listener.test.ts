import { describe, it, expect, vi } from 'vitest';
import type { EventBus, RequestContext } from '@vendure/core';
import { AdministratorLinkedEvent } from '@mivend/plugin-access-control';

import { AdministratorLinkedListener } from '../../administrator-linked.listener';
import type { CounterpartyService } from '../../counterparty.service';

// mivend.audit.common (2026-09-20): the missing revisit for a Counterparty left with
// assignedManagerId:null while its manager's erpId was still unlinked (see
// CounterpartyStreamHandler.resolveAssignedManagerId's "known, not a race" branch) — this
// listener is what backfills it once the link actually happens.
describe('AdministratorLinkedListener', () => {
    const ctx = {} as RequestContext;

    it('subscribes to AdministratorLinkedEvent on bootstrap', () => {
        const eventBus = { ofType: vi.fn(() => ({ subscribe: vi.fn() })) } as unknown as EventBus;
        const counterpartyService = {
            backfillAssignedManager: vi.fn(),
        } as unknown as CounterpartyService;
        const listener = new AdministratorLinkedListener(eventBus, counterpartyService);

        listener.onApplicationBootstrap();

        expect(eventBus.ofType).toHaveBeenCalledWith(AdministratorLinkedEvent);
    });

    it('calls CounterpartyService.backfillAssignedManager with the event erpId/administratorId', async () => {
        const eventBus = { ofType: vi.fn() } as unknown as EventBus;
        const backfillAssignedManager = vi.fn().mockResolvedValue(2);
        const counterpartyService = { backfillAssignedManager } as unknown as CounterpartyService;
        const listener = new AdministratorLinkedListener(eventBus, counterpartyService);

        const event = new AdministratorLinkedEvent(ctx, 'user-erp-1', 'admin-1');
        await (
            listener as unknown as { handle(e: AdministratorLinkedEvent): Promise<void> }
        ).handle(event);

        expect(backfillAssignedManager).toHaveBeenCalledWith(ctx, 'user-erp-1', 'admin-1');
    });
});
