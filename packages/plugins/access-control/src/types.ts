import { ID } from '@vendure/common/lib/shared-types';

export type AccessScopeKind = 'own' | 'department' | 'all';

export interface AccessScope {
    kind: AccessScopeKind;
    administratorId?: ID;
    departmentId?: string;
    branchId?: string;
}

export const loggerCtx = 'AccessControlPlugin';

export const ACCESS_CONTROL_PLUGIN_OPTIONS = Symbol('ACCESS_CONTROL_PLUGIN_OPTIONS');

export interface AccessControlPluginOptions {
    branchNames?: string[];
    defaultPriceTypeCode?: string;
    defaultCurrencyCode?: string;
}
