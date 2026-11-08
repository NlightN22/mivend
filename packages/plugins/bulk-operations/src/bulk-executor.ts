import type { RequestContext } from '@vendure/core';

export type BulkParameters = Record<string, unknown>;
export type BulkVerdictOutcome = 'applied' | 'skipped';

// Stable reason codes are part of the result contract; the UI translates them.
export interface BulkRecordVerdict {
    outcome: BulkVerdictOutcome;
    reasonCode: string | null;
    message: string | null;
    label: string | null;
}

export interface BulkUndoPlan {
    type: string;
    parameters: BulkParameters;
}

// An operation lives in the plugin that owns its data and registers one executor here.
export interface BulkExecutor {
    type: string;
    title: string;
    description: string;
    area: string;
    permission: string;
    // Throws UserInputError on bad parameters; returns the normalised parameters that are stored.
    validate(parameters: BulkParameters): BulkParameters;
    // Read-only verdict for the review step; advisory, apply() decides again under the lock.
    inspect(
        ctx: RequestContext,
        targetId: string,
        parameters: BulkParameters,
    ): Promise<BulkRecordVerdict>;
    // Re-validates under the row lock, applies, and reports; a thrown error becomes a failed row.
    apply(
        ctx: RequestContext,
        targetId: string,
        parameters: BulkParameters,
    ): Promise<BulkRecordVerdict>;
    // The subset of ids the actor may see; the history list shows only these.
    visibleTargets(ctx: RequestContext, targetIds: string[]): Promise<Set<string>>;
    // Present only for reversible operations; null when these parameters cannot be reversed.
    undoPlan?(parameters: BulkParameters): BulkUndoPlan | null;
}
