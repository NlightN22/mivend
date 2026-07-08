import { ID } from '@vendure/common/lib/shared-types';

export type AccessScopeKind = 'own' | 'department' | 'all';

export interface AccessScope {
    kind: AccessScopeKind;
    administratorId?: ID;
    departmentId?: string;
    branchId?: string;
}

export const loggerCtx = 'AccessControlPlugin';
