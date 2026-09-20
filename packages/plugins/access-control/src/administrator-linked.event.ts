import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, VendureEvent } from '@vendure/core';

// Published once an erpId gets linked to a real Administrator, by either path (auto email-match
// in UserEnrichmentService.linkAndEnrich, or manual creation in
// AdministratorProvisioningService.createFromPending). mivend.audit.common's diagnosis
// (2026-09-20) of issue #104's `counterparty` stream inbox backlog: plugin-counterparty
// subscribes to this to backfill any Counterparty whose `assignedManagerId` was left null
// because this erpId was `unlinked` at the time its `counterparty` event was processed — same
// "publish, another plugin subscribes" pattern as CreditTermApprovedEvent.
export class AdministratorLinkedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly erpId: string,
        public readonly administratorId: ID,
    ) {
        super();
    }
}
