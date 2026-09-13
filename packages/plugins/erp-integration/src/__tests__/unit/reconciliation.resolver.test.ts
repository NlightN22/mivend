import { describe, expect, it } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ReconciliationResolver } from '../../reconciliation.resolver';

// mivend.audit.85 LOW finding: every mutation/query gated by @Allow must have a test asserting
// the gate is actually there, not just trusting the decorator was typed correctly by hand.
describe('ReconciliationResolver @Allow gating', () => {
    const prototype = ReconciliationResolver.prototype;

    it.each([
        'openErpReconciliationIssues',
        'runErpReconciliation',
        'resolveErpReconciliationIssue',
    ])('%s requires ManageErpIntegration', methodName => {
        const permissions = Reflect.getMetadata(
            PERMISSIONS_METADATA_KEY,
            prototype[methodName as keyof typeof prototype],
        );
        expect(permissions).toEqual([CustomPermission.ManageErpIntegration.Permission]);
    });
});
