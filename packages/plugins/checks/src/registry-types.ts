import type { RequestContext } from '@vendure/core';

import type { Consequence, Finding } from './types';

export interface CheckContext {
    ctx: RequestContext;
    stage: string;
    // The policy row's recipient (a role or group code) for the run, null when none is set.
    recipient: string | null;
}

export interface SubjectTypeDefinition<S = unknown> {
    type: string;
    stages: readonly string[];
    allowedConsequences: readonly Consequence[];
    // Extra consequences allowed only at one stage (e.g. `block` on an input-validation stage).
    stageConsequences?: Readonly<Record<string, readonly Consequence[]>>;
    // An ephemeral subject is an in-flight request built by the caller: evaluated, never loaded, locked or stored.
    ephemeral?: boolean;
    loadSubject?(ctx: RequestContext, subjectRef: string): Promise<S | null>;
    lockKey?(subjectRef: string): string;
    dataVersion?(subject: S): string;
    // Branch scope of the subject: a branch policy row overrides the global one; null means global only.
    branchId?(subject: S): string | null;
    // Admin reads of stored results go through it; absent means nothing is readable (fail closed).
    visibleSubjectIds?(ctx: RequestContext, subjectIds: string[]): Promise<Set<string>>;
}

export interface CheckProvider<S = unknown> {
    code: string;
    subjectType: string;
    stages: readonly string[];
    description: string;
    defaultConsequence?: Consequence;
    // Per-stage default overriding `defaultConsequence`; the lazily created policy rows start from it.
    stageDefaults?: Readonly<Record<string, Consequence>>;
    // Off until a policy turns it on (an existing opt-in toggle); a stage missing from the record is on.
    defaultEnabled?: boolean | Readonly<Record<string, boolean>>;
    evaluate(subject: S, context: CheckContext): Promise<Finding[]> | Finding[];
}
