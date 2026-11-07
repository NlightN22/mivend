import { adminApi } from './client';
import { OrderCheckDefinitionsDocument, OrderCheckPoliciesDocument } from './generated/graphql';
import type { CheckDefinition, CheckPolicy } from './checkPolicies';

export interface OrderCheckRules {
    definitions: CheckDefinition[];
    policies: CheckPolicy[];
}

// Policies need ManageCheckPolicies; without it the declared defaults of the definitions apply.
export async function fetchOrderCheckRules(): Promise<OrderCheckRules> {
    const definitions = (await adminApi(OrderCheckDefinitionsDocument))
        .checkDefinitions as CheckDefinition[];
    try {
        return {
            definitions,
            policies: (await adminApi(OrderCheckPoliciesDocument)).checkPolicies,
        };
    } catch {
        return { definitions, policies: [] };
    }
}
