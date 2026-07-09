export interface WorkflowStepDefinition {
    order: number;
    role: string;
    requiredPermission: string;
    escalatesTo: string[];
}

export type ApprovalStepDecision = 'approved' | 'rejected';

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
