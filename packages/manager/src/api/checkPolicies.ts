import { adminApi } from './client';
import {
    CheckDefinitionsDocument,
    CheckPoliciesDocument,
    ResetCheckPolicyOverrideDocument,
    UpdateCheckPolicyDocument,
} from './generated/graphql';

export interface CheckDefinition {
    code: string;
    subjectType: string;
    stages: string[];
    description: string;
    defaultConsequence: string;
    allowedConsequences: string[];
    stageConsequences: Record<string, string[]> | null;
    stageDefaults: Record<string, string> | null;
    // A boolean for every stage, or a per-stage record where a missing stage is on.
    defaultEnabled: boolean | Record<string, boolean>;
}

export interface CheckPolicy {
    id: string;
    checkCode: string;
    stage: string;
    branchId: string | null;
    consequence: string;
    recipient: string | null;
    enabled: boolean;
}

export async function fetchCheckDefinitions(): Promise<CheckDefinition[]> {
    return (await adminApi(CheckDefinitionsDocument)).checkDefinitions as CheckDefinition[];
}

export async function fetchCheckPolicies(): Promise<CheckPolicy[]> {
    return (await adminApi(CheckPoliciesDocument)).checkPolicies;
}

export async function updateCheckPolicy(input: {
    checkCode: string;
    stage: string;
    branchId: string | null;
    consequence: string;
    recipient: string | null;
    enabled: boolean;
}): Promise<CheckPolicy> {
    return (await adminApi(UpdateCheckPolicyDocument, { input })).updateCheckPolicy;
}

export async function resetCheckPolicyOverride(
    checkCode: string,
    stage: string,
    branchId: string,
): Promise<boolean> {
    return (await adminApi(ResetCheckPolicyOverrideDocument, { checkCode, stage, branchId }))
        .resetCheckPolicyOverride;
}
