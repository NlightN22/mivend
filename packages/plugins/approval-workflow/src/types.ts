export interface WorkflowStepDefinition {
    order: number;
    role: string;
    requiredPermission: string;
    escalatesTo: string[];
}

export type ApprovalStepDecision = 'approved' | 'rejected';

// Pushed all the way into the SQL query in ApprovalRequestService — see getEligibleStepPairs().
// `search` only matches the request id (no server-side text index over resolved customer/order
// names exists yet — those are resolved client-side by joining orders/counterparties, so cannot
// be filtered server-side without a further join here too).
export interface ApprovalListOptions {
    take?: number;
    skip?: number;
    search?: string;
    requestType?: string;
    status?: string;
}

export const loggerCtx = 'ApprovalWorkflowPlugin';

// Thrown when a decide() call loses the race against a concurrent decision on the same
// ApprovalRequest — the caller should surface this as "someone else already decided this
// step, refresh and check the outcome" rather than a generic 500.
export class ApprovalConcurrencyError extends Error {
    constructor(requestId: string) {
        super(
            `ApprovalRequest ${requestId} was modified concurrently by another decision — refresh and retry`,
        );
        this.name = 'ApprovalConcurrencyError';
    }
}
