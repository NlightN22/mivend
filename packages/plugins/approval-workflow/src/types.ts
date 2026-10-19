export interface WorkflowStepDefinition {
    order: number;
    role: string;
    requiredPermission: string;
    escalatesTo: string[];
}

export type ApprovalStepDecision = 'approved' | 'rejected';

// Search matches only the request id: customer/order names are resolved client-side, so there is
// no server-side text index to filter them without an extra join.
export interface ApprovalListOptions {
    take?: number;
    skip?: number;
    search?: string;
    requestType?: string;
    status?: string;
    // IN-filter alternative to `status` — e.g. the Discounts registry wants "pending OR
    // rejected" in one query. If both are set, `statuses` wins.
    statuses?: string[];
    // Set by the resolver from PriceTypeAccessService; never a client argument.
    allowedPriceTypeCodes?: string[];
}

export const loggerCtx = 'ApprovalWorkflowPlugin';

// Concurrent decide() on the same ApprovalRequest is an expected race, not a server fault;
// callers must map it to a conflict response instead of a generic 500.
export class ApprovalConcurrencyError extends Error {
    constructor(requestId: string) {
        super(
            `ApprovalRequest ${requestId} was modified concurrently by another decision — refresh and retry`,
        );
        this.name = 'ApprovalConcurrencyError';
    }
}
