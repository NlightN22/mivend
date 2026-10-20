import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { CustomPermission } from '../../custom-permission';
import { DepartmentBranchMappingService } from '../../department-branch-mapping.service';
import { DepartmentBranchResolver } from '../../department-branch.resolver';
import type { BranchAssignmentService } from '../../branch-assignment.service';

describe('DepartmentBranchResolver permission gates', () => {
    it.each(['departmentBranchOverview', 'setDepartmentBranch', 'clearDepartmentBranch'] as const)(
        '%s is gated by exactly ManageAccessControl',
        method => {
            const gate = Reflect.getMetadata(
                PERMISSIONS_METADATA_KEY,
                DepartmentBranchResolver.prototype[method],
            );
            expect(gate).toEqual([CustomPermission.ManageAccessControl.Permission]);
        },
    );
});

describe('DepartmentBranchMappingService on a replica', () => {
    const withTransaction = vi.fn();
    const service = new DepartmentBranchMappingService(
        { withTransaction } as unknown as TransactionalConnection,
        { isReplica: true } as unknown as BranchAssignmentService,
    );
    const ctx = {} as RequestContext;

    it.each([
        ['set', () => service.set(ctx, 'dept-1', '1')],
        ['clear', () => service.clear(ctx, 'dept-1')],
        ['setCounterpartyOverride', () => service.setCounterpartyOverride(ctx, '1', '1')],
    ])('%s is rejected before any write', async (_name, call) => {
        await expect(call()).rejects.toThrow(/central instance/);
        expect(withTransaction).not.toHaveBeenCalled();
    });
});
