import type { RequestContext } from '@vendure/core';

import type { Consequence, Finding } from './types';

export interface CheckContext {
    ctx: RequestContext;
    stage: string;
}

export interface SubjectTypeDefinition<S = unknown> {
    type: string;
    stages: readonly string[];
    allowedConsequences: readonly Consequence[];
    loadSubject(ctx: RequestContext, subjectRef: string): Promise<S | null>;
    lockKey(subjectRef: string): string;
    dataVersion?(subject: S): string;
    // Admin reads of stored results go through it so one actor never reads another scope's subjects.
    visibleSubjectIds(ctx: RequestContext, subjectIds: string[]): Promise<Set<string>>;
}

export interface CheckProvider<S = unknown> {
    code: string;
    subjectType: string;
    stages: readonly string[];
    description: string;
    defaultConsequence?: Consequence;
    evaluate(subject: S, context: CheckContext): Promise<Finding[]> | Finding[];
}
