import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, VendureEvent } from '@vendure/core';

// Subscribers backfill Counterparties left with null assignedManagerId while erpId was unlinked.
// Must be published from both link paths (auto email match and manual creation).
export class AdministratorLinkedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly erpId: string,
        public readonly administratorId: ID,
    ) {
        super();
    }
}
