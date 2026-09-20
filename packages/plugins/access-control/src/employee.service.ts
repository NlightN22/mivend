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
import { loggerCtx } from './types';

export interface EmployeeRecordInput {
    erpId: string;
    email: string;
    departmentErpId: string;
    // The ERP's own branch/point code (Branch.erpId) — NOT a mivend Branch.id. Resolved against
    // Branch the same way WarehouseService.upsert resolves WarehouseChanged.branchId, before
    // ever being written to Administrator.customFields.branchId — see docs/access-control.md's
    // "Branch vs Department" section for why this resolution step is mandatory (a raw, unresolved
    // ERP id here is a different value space than the mivend Branch.id every other branchId
    // consumer — AccessScopeService, BranchSettingsService, Warehouse.branchId — expects).
    branchErpId?: string | null;
    roleCode?: string | null;
    position?: string | null;
}

// Binds ERP org-structure data (department/branch/role) onto an existing Administrator,
// matched by email. Never creates an Administrator — account provisioning (login/password)
// is Vendure system configuration, out of erp-import's scope, same carve-out as tax
// zones/channels in the backend-plugin-rules skill's "Dev seed rules". If no matching
// Administrator exists yet,
// the record is skipped with a warning, not silently dropped.
@Injectable()
export class EmployeeService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private requestContextService: RequestContextService,
        private roleService: RoleService,
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
                position: record.position ?? null,
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

        // The erp-import controller builds an unauthenticated RequestContext (no session/user)
        // — fine for plugin-owned entities, but AdministratorService.update() enforces Vendure's
        // own RBAC internally and rejects it with "insufficient permissions". Elevate to a
        // system-level context (the bootstrap SuperAdmin user) only for this one privileged
        // call, not for the rest of the import batch.
        const systemCtx = await this.getSystemContext(ctx);
        await this.administratorService.update(systemCtx, updateInput);
        Logger.verbose(
            `Assigned department=${record.departmentErpId} branch=${branchId ?? 'null'} to administrator ${record.email}`,
            loggerCtx,
        );
    }

    // Mirrors WarehouseService.upsert's resolution of an ERP-side branch/point code into the
    // mivend Branch.id every other branchId consumer (AccessScopeService, BranchSettingsService,
    // Warehouse.branchId) expects — see EmployeeRecordInput.branchErpId's own comment. Leaves
    // branchId null (never fabricated) rather than skipping the whole record when the code
    // doesn't resolve to a known Branch yet — same "assign manually later" fallback Warehouse
    // uses, since org-structure import for other fields must still proceed.
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
