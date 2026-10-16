import { adminApi } from './client';
import {
    OrderCheckDefinitionsDocument,
    OrderCheckPoliciesDocument,
    ResetCheckPolicyOverrideDocument,
    UpdateCheckPolicyDocument,
} from './generated/graphql';

export interface CheckDefinition {
    code: string;
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

export async function fetchOrderCheckDefinitions(): Promise<CheckDefinition[]> {
    return (await adminApi(OrderCheckDefinitionsDocument)).checkDefinitions as CheckDefinition[];
}

export async function fetchOrderCheckPolicies(): Promise<CheckPolicy[]> {
    return (await adminApi(OrderCheckPoliciesDocument)).checkPolicies;
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
