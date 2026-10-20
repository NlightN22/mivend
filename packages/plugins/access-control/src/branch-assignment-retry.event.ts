import { RequestContext, VendureEvent } from '@vendure/core';

export interface SkippedRows {
    administratorIds: string[];
    counterpartyIds: string[];
}

// Published when a reconcile skipped rows another transaction held; handled after that commit.
export class BranchAssignmentRetryEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly skipped: SkippedRows,
        public readonly attempt: number,
    ) {
        super();
    }
}
