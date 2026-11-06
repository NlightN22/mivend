import { adminApi } from './client';
import {
    SystemHealthChecklistDocument,
    type SystemHealthChecklistQuery,
} from './generated/graphql';

export type SystemHealthCheckItem = SystemHealthChecklistQuery['systemHealthChecklist'][number];

// One plugin query under ManageAccessControl: the checks need Vendure Settings reads that business roles lack.
export async function fetchSystemHealthChecklist(): Promise<SystemHealthCheckItem[]> {
    const result = await adminApi(SystemHealthChecklistDocument);
    return result.systemHealthChecklist;
}
