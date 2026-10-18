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

import { Branch } from './entities/branch.entity';
import { ErpUserService } from './erp-user.service';
import { loggerCtx } from './types';

export interface EmployeeRecordInput {
    erpId: string;
    email: string;
    departmentErpId: string;
    // ERP branch code (Branch.erpId), not a mivend Branch.id: must be resolved to Branch.id first
    // Raw ERP ids are a different value space; every branchId consumer expects Branch.id.
    branchErpId?: string | null;
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

        const branchId = await this.resolveBranchId(ctx, record);

        const updateInput: UpdateAdministratorInput = {
            id: admin.id,
            customFields: {
                departmentId: record.departmentErpId,
                branchId,
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
        await this.erpUserService.setPositionIfExists(
            ctx,
            record.erpId,
            record.positionErpId ?? null,
        );
        Logger.verbose(
            `Assigned department=${record.departmentErpId} branch=${branchId ?? 'null'} to administrator ${record.email}`,
            loggerCtx,
        );
    }

    // Resolves the ERP branch code to Branch.id the same way WarehouseService.upsert does.
    // Unresolved codes leave branchId null instead of skipping, so other org fields still import.
    private async resolveBranchId(
        ctx: RequestContext,
        record: EmployeeRecordInput,
    ): Promise<string | null> {
        if (!record.branchErpId) return null;
        const branch = await this.connection
            .getRepository(ctx, Branch)
            .findOne({ where: { erpId: record.branchErpId } });
        if (!branch) {
            Logger.warn(
                `employee erpId=${record.erpId}: branch erpId=${record.branchErpId} not found — leaving branchId unassigned`,
                loggerCtx,
            );
            return null;
        }
        return String(branch.id);
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
