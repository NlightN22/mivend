import { ForbiddenError, RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import type { ListFilter } from 'shared';

import type { CounterpartySortParameter } from './types';

const CREDIT_FIELDS = ['creditLimit', 'creditBalance'];

function filterUsesCredit(filter: ListFilter | undefined): boolean {
    if (!filter) return false;
    return Object.entries(filter).some(([key, value]) => {
        if (key === '_and' || key === '_or') {
            return Array.isArray(value) && value.some(f => filterUsesCredit(f as ListFilter));
        }
        return CREDIT_FIELDS.includes(key) && value !== undefined && value !== null;
    });
}

// Filtering or sorting by credit would reveal it to a caller the field resolvers already refuse.
export function assertCreditListAccess(
    ctx: RequestContext,
    filter: ListFilter | undefined,
    sort: CounterpartySortParameter | undefined,
): void {
    const sortsByCredit = CREDIT_FIELDS.some(f => sort?.[f as keyof CounterpartySortParameter]);
    if (!sortsByCredit && !filterUsesCredit(filter)) return;
    if (!ctx.userHasPermissions([CustomPermission.ReadCounterpartyCredit.Permission])) {
        throw new ForbiddenError();
    }
}
