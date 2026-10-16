import { adminApi } from './client';
import {
    OrderCheckDefinitionsDocument,
    OrderCheckPoliciesDocument,
    UpdateCheckPolicyDocument,
} from './generated/graphql';

export interface CheckDefinition {
    code: string;
    stages: string[];
    description: string;
    defaultConsequence: string;
    allowedConsequences: string[];
}

export interface CheckPolicy {
    id: string;
    checkCode: string;
    stage: string;
    consequence: string;
    recipient: string | null;
    enabled: boolean;
}

export async function fetchOrderCheckDefinitions(): Promise<CheckDefinition[]> {
    return (await adminApi(OrderCheckDefinitionsDocument)).checkDefinitions;
}

export async function fetchOrderCheckPolicies(): Promise<CheckPolicy[]> {
    return (await adminApi(OrderCheckPoliciesDocument)).checkPolicies;
}

export async function updateCheckPolicy(input: {
    checkCode: string;
    stage: string;
    consequence: string;
    recipient: string | null;
    enabled: boolean;
}): Promise<CheckPolicy> {
    return (await adminApi(UpdateCheckPolicyDocument, { input })).updateCheckPolicy;
}
