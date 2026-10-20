import { Injectable } from '@nestjs/common';
import { UpdateAdministratorInput } from '@vendure/common/lib/generated-types';
import {
    Administrator,
    AdministratorService,
    InternalServerError,
    Logger,
    RequestContext,
    RequestContextService,
    Role,
    RoleService,
    TransactionalConnection,
    User,
    UserInputError,
} from '@vendure/core';

import { BranchAssignmentService } from './branch-assignment.service';
import { ErpUserService } from './erp-user.service';
import { loggerCtx } from './types';

export interface EmployeeRecordInput {
    erpId: string;
    email: string;
    departmentErpId: string;
    roleCode?: string | null;
    // ErpPosition.erpId, stored on the ERP user, not on the Administrator.
    positionErpId?: string | null;
}

// Binds org data onto an existing Administrator matched by email; never creates one.
// Account provisioning is out of scope; a missing Administrator is skipped with a warning.
@Injectable()
export class EmployeeService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private requestContextService: RequestContextService,
        private roleService: RoleService,
        private erpUserService: ErpUserService,
        private branchAssignment: BranchAssignmentService,
    ) {}

    async upsert(ctx: RequestContext, record: EmployeeRecordInput): Promise<void> {
        const admin = await this.connection
            .getRepository(ctx, Administrator)
            .findOne({ where: { emailAddress: record.email } });
        if (!admin) {
            Logger.warn(
                `No Administrator found for employee email "${record.email}" (erpId=${record.erpId}) — skipping. Administrator accounts are provisioned manually, not created by org-structure import.`,
                loggerCtx,
            );
            return;
        }

        const updateInput: UpdateAdministratorInput = {
            id: admin.id,
            customFields: {
                departmentId: record.departmentErpId,
            },
        };

        if (record.roleCode) {
            const role = await this.connection
                .getRepository(ctx, Role)
                .findOne({ where: { code: record.roleCode } });
            if (!role) {
                throw new UserInputError(`No Role registered with code "${record.roleCode}"`);
            }
            updateInput.roleIds = [role.id];
        }

        // AdministratorService.update() enforces RBAC and rejects the unauthenticated import context.
        // Elevate to the bootstrap SuperAdmin only for this call, not the whole batch.
        const systemCtx = await this.getSystemContext(ctx);
        await this.administratorService.update(systemCtx, updateInput);
        await this.branchAssignment.assignAdministrator(ctx, admin.id);
        const positionStored = await this.erpUserService.setPositionIfExists(
            ctx,
            record.erpId,
            record.positionErpId ?? null,
        );
        if (!positionStored) {
            Logger.warn(
                `No ERP user row for employee erpId=${record.erpId}, position not stored`,
                loggerCtx,
            );
        }
        Logger.verbose(
            `Assigned department=${record.departmentErpId} to administrator ${record.email}`,
            loggerCtx,
        );
    }

    private async getSystemContext(ctx: RequestContext): Promise<RequestContext> {
        const superAdminRole = await this.roleService.getSuperAdminRole(ctx);
        const user = await this.connection
            .getRepository(ctx, User)
            .createQueryBuilder('user')
            .innerJoinAndSelect('user.roles', 'role', 'role.id = :roleId', {
                roleId: superAdminRole.id,
            })
            .leftJoinAndSelect('role.channels', 'channel')
            .getOne();
        if (!user) {
            throw new InternalServerError('No user with the SuperAdmin role was found');
        }
        return this.requestContextService.create({
            apiType: 'admin',
            user,
            channelOrToken: ctx.channel,
        });
    }
}
