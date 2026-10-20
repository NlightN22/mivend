import { Injectable } from '@nestjs/common';
import { Administrator, AdministratorService, ForbiddenError, RequestContext } from '@vendure/core';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { RoleScopeConfigService } from './role-scope-config.service';
import { VisibilityGrantReader } from './visibility-grant-reader.service';
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
        private grantReader: VisibilityGrantReader,
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

    // All the acting administrator's role codes (a limit is the most permissive among them) and branch.
    async getActorIdentity(
        ctx: RequestContext,
    ): Promise<{ roleCodes: string[]; branchId: string | null }> {
        const admin = await this.getAdministrator(ctx);
        const customFields = admin?.customFields as { branchId?: string | null } | undefined;
        return {
            roleCodes: (admin?.user?.roles ?? []).map(r => r.code).sort(),
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
                        (scope.administratorId != null ? String(scope.administratorId) : null) &&
                    !this.isGrantedManager(scope, counterparty.assignedManagerId)
                ) {
                    throw new ForbiddenError();
                }
                break;
            case 'department':
                // Mirrors the list's SQL `= NULL`: a branchless caller writes nothing.
                if (
                    (scope.branchId == null || counterparty.branchId !== scope.branchId) &&
                    !this.managerIdsOf(scope).includes(String(counterparty.assignedManagerId))
                ) {
                    throw new ForbiddenError();
                }
                break;
            case 'all':
                break;
        }
    }

    // Raw SQL EXISTS, not an entity import: access-control cannot depend on the counterparty plugin.
    // 'Own' = assignedManagerId OR a counterparty_team_member row OR a granted manager's client.
    applyOwnCounterpartyFilter<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        counterpartyAlias: string,
        scope: AccessScope,
    ): void {
        const granted = this.managerClause(scope, counterpartyAlias, 'ownGrantedManagerIds');
        qb.andWhere(
            `(${counterpartyAlias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${counterpartyAlias}.id::text
                AND ctm."administratorId" = :ownScopeAdminId
            )${granted ? ` OR ${granted.sql}` : ''})`,
            {
                ownScopeAdminId:
                    scope.administratorId != null ? String(scope.administratorId) : null,
                ...granted?.params,
            },
        );
    }

    // SQL for "the counterparty belongs to one of the scope's managers" (own clients for a
    // branch-scoped caller, plus granted managers); null when there is no such manager.
    managerClause(
        scope: AccessScope,
        counterpartyAlias: string,
        param = 'visibleManagerIds',
    ): { sql: string; params: Record<string, string[]> } | null {
        const ids = this.managerIdsOf(scope);
        if (ids.length === 0) return null;
        return {
            sql: `${counterpartyAlias}."assignedManagerId" IN (:...${param})`,
            params: { [param]: ids },
        };
    }

    // The union set besides the primary branch: granted managers, and the caller itself for 'department'.
    private managerIdsOf(scope: AccessScope): string[] {
        const own =
            scope.kind === 'department' && scope.administratorId != null
                ? [String(scope.administratorId)]
                : [];
        return [...own, ...(scope.grantedManagerIds ?? [])];
    }

    private isGrantedManager(scope: AccessScope, managerId: string | null): boolean {
        return managerId != null && (scope.grantedManagerIds ?? []).includes(managerId);
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
        if (maxScope === 'all') return { kind: 'all' };
        const grantedManagerIds = await this.grantReader.activeManagerIds(ctx, String(admin.id));
        if (maxScope === 'department') {
            return {
                kind: 'department',
                administratorId: admin.id,
                departmentId: customFields?.departmentId ?? undefined,
                branchId: customFields?.branchId ?? undefined,
                grantedManagerIds,
            };
        }
        return { kind: 'own', administratorId: admin.id, grantedManagerIds };
    }

    private async getAdministrator(ctx: RequestContext): Promise<Administrator | null> {
        if (!ctx.activeUserId) return null;
        const admin = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId, [
            'user.roles',
        ]);
        return admin ?? null;
    }
}
