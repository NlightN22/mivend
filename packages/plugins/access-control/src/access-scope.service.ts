import { Injectable } from '@nestjs/common';
import { Administrator, AdministratorService, ForbiddenError, RequestContext } from '@vendure/core';

import { RoleScopeConfigService } from './role-scope-config.service';
import { AccessScope } from './types';

/**
 * Single, reusable row-level visibility resolver — never copy-pasted role checks in resolvers
 * or domain services. Every resource-specific `resolve<Resource>Scope` method here does the
 * same two things: find the caller's max scope for that resource, then attach the identifiers
 * needed to filter by it. See docs/access-control.md, layer 3.
 */
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

    // Throws ForbiddenError unless the caller's counterparty scope covers the given
    // counterparty — same own/department/all logic CounterpartyService.findVisible uses to
    // filter a list, but as an assertion for a single record ahead of a write. Shared by any
    // service that writes data owned by a Counterparty (e.g. TradingPointService) so the
    // own/department/all switch isn't duplicated per plugin.
    async assertCounterpartyWritable(
        ctx: RequestContext,
        counterparty: {
            assignedManagerId: string | null;
            departmentId: string | null;
            branchId: string | null;
        },
    ): Promise<void> {
        const scope = await this.resolveCounterpartyScope(ctx);
        switch (scope.kind) {
            case 'own':
                // administratorId comes off the Administrator entity's `id: ID`, which can be a
                // number at runtime under the numeric ID strategy even though Vendure types it
                // string|number — assignedManagerId is a plain varchar column, so a strict `!==`
                // between "6" and 6 would always mismatch. Normalize both to string first.
                if (
                    counterparty.assignedManagerId !==
                    (scope.administratorId != null ? String(scope.administratorId) : null)
                ) {
                    throw new ForbiddenError();
                }
                break;
            case 'department':
                if (
                    counterparty.departmentId !== (scope.departmentId ?? null) ||
                    counterparty.branchId !== (scope.branchId ?? null)
                ) {
                    throw new ForbiddenError();
                }
                break;
            case 'all':
                break;
        }
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
