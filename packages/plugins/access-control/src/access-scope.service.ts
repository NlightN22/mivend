import { Injectable } from '@nestjs/common';
import { Administrator, AdministratorService, RequestContext } from '@vendure/core';

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
