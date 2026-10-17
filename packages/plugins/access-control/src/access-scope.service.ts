import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Administrator, AdministratorService, ForbiddenError, RequestContext } from '@vendure/core';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { RoleScopeConfigService } from './role-scope-config.service';
import { AccessScope } from './types';

// Single row-level visibility resolver; do not copy role checks into resolvers or services.
// See docs/access-control.md, layer 3.
interface CounterpartyScopeFields {
    assignedManagerId: string | null;
    departmentId: string | null;
    branchId: string | null;
}

@Injectable()
export class AccessScopeService {
    constructor(
        private administratorService: AdministratorService,
        private roleScopeConfigService: RoleScopeConfigService,
    ) {}

    async resolveCounterpartyScope(ctx: RequestContext): Promise<AccessScope> {
        return this.resolveScope(ctx, 'counterparty');
    }

    async resolveOrderScope(ctx: RequestContext): Promise<AccessScope> {
        return this.resolveScope(ctx, 'order');
    }

    async resolveTeamVisibilityScope(ctx: RequestContext): Promise<AccessScope> {
        return this.resolveScope(ctx, 'teamVisibility');
    }

    // PaymentAttempt (plugin-acquiring) is derived from ProformaInvoice via proformaInvoiceId,
    // so it reuses this scope instead of having its own resolvePaymentScope.
    async resolveProformaInvoiceScope(ctx: RequestContext): Promise<AccessScope> {
        return this.resolveScope(ctx, 'proformaInvoice');
    }

    // Kept separate from resource scope: scope 'all' has no departmentId, but teamMembers()
    // needs it to always show real names for same-department colleagues.
    async getOwnDepartmentId(ctx: RequestContext): Promise<string | null> {
        const admin = await this.getAdministrator(ctx);
        const customFields = admin?.customFields as { departmentId?: string | null } | undefined;
        return customFields?.departmentId ?? null;
    }

    // The acting administrator's first role code and branch, for per-actor limits and branch policies.
    async getActorIdentity(
        ctx: RequestContext,
    ): Promise<{ roleCode: string | null; branchId: string | null }> {
        const admin = await this.getAdministrator(ctx);
        const customFields = admin?.customFields as { branchId?: string | null } | undefined;
        return {
            roleCode: admin?.user?.roles?.[0]?.code ?? null,
            branchId: customFields?.branchId ?? null,
        };
    }

    // Throws ForbiddenError unless the caller's counterparty scope covers this row. Only
    // `branchId` gates 'department' scope; `departmentId` is informational (docs/access-control.md).
    async assertCounterpartyWritable(
        ctx: RequestContext,
        counterparty: CounterpartyScopeFields,
    ): Promise<void> {
        this.assertCounterpartyWritableInScope(
            await this.resolveCounterpartyScope(ctx),
            counterparty,
        );
    }

    // For batch writes that already resolved the scope once.
    assertCounterpartyWritableInScope(
        scope: AccessScope,
        counterparty: CounterpartyScopeFields,
    ): void {
        switch (scope.kind) {
            case 'own':
                // Numeric ID strategy can make administratorId a number; assignedManagerId is varchar.
                if (
                    counterparty.assignedManagerId !==
                    (scope.administratorId != null ? String(scope.administratorId) : null)
                ) {
                    throw new ForbiddenError();
                }
                break;
            case 'department':
                // Mirrors the list's SQL `= NULL`: a branchless caller writes nothing.
                if (scope.branchId == null || counterparty.branchId !== scope.branchId) {
                    throw new ForbiddenError();
                }
                break;
            case 'all':
                break;
        }
    }

    // Raw SQL EXISTS, not an entity import: access-control cannot depend on the counterparty plugin.
    // 'Own' = assignedManagerId OR a counterparty_team_member row; names match TypeORM defaults.
    applyOwnCounterpartyFilter<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        counterpartyAlias: string,
        administratorId: ID | undefined,
    ): void {
        qb.andWhere(
            `(${counterpartyAlias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${counterpartyAlias}.id::text
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
            { ownScopeAdminId: administratorId != null ? String(administratorId) : null },
        );
    }

    private async resolveScope(ctx: RequestContext, resource: string): Promise<AccessScope> {
        const admin = await this.getAdministrator(ctx);
        if (!admin) {
            return { kind: 'own' };
        }
        const roles = admin.user.roles;
        const maxScope = await this.roleScopeConfigService.maxScopeFor(ctx, roles, resource);
        const customFields = admin.customFields as
            | { departmentId?: string | null; branchId?: string | null }
            | undefined;
        switch (maxScope) {
            case 'all':
                return { kind: 'all' };
            case 'department':
                return {
                    kind: 'department',
                    administratorId: admin.id,
                    departmentId: customFields?.departmentId ?? undefined,
                    branchId: customFields?.branchId ?? undefined,
                };
            default:
                return { kind: 'own', administratorId: admin.id };
        }
    }

    private async getAdministrator(ctx: RequestContext): Promise<Administrator | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId, [
            'user.roles',
        ]);
        return admin ?? null;
    }
}
