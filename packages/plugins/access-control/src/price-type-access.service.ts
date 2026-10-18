import { Injectable } from '@nestjs/common';
import { ForbiddenError, RequestContext, TransactionalConnection } from '@vendure/core';

import { AccessScopeService } from './access-scope.service';
import { BranchSettingsService } from './branch-settings.service';
import { CustomPermission } from './custom-permission';

export interface AccessiblePriceType {
    id: string;
    code: string;
    externalId: string | null;
    visibility: string;
}

export interface PriceTypeAccessContext {
    // Codes shown in the context of one customer/order: allowed when a customer type, even outside the branch list.
    contextCodes?: Array<string | null | undefined>;
}

// The single deny-by-default decision for price types (docs/access-control.md, layer 4):
// customer types = branch allow-list (+ branch default) or ReadAllCustomerPriceTypes;
// confidential types = ReadConfidentialPriceTypes only, never a branch rule or a context.
@Injectable()
export class PriceTypeAccessService {
    constructor(
        private connection: TransactionalConnection,
        private accessScope: AccessScopeService,
        private branchSettings: BranchSettingsService,
    ) {}

    canReadConfidential(ctx: RequestContext): boolean {
        return ctx.userHasPermissions([CustomPermission.ReadConfidentialPriceTypes.Permission]);
    }

    async list(
        ctx: RequestContext,
        access: PriceTypeAccessContext = {},
    ): Promise<AccessiblePriceType[]> {
        const rows: AccessiblePriceType[] = await this.connection.rawConnection.query(
            `SELECT id::varchar AS id, code, "externalId", visibility FROM price_type ORDER BY code`,
        );
        const confidential = this.canReadConfidential(ctx);
        const branchIds = await this.branchAllowedIds(ctx);
        const contextCodes = new Set(access.contextCodes ?? []);
        return rows.filter(row => {
            if (row.visibility === 'customer') {
                return branchIds === 'all' || branchIds.has(row.id) || contextCodes.has(row.code);
            }
            return confidential;
        });
    }

    async allowedCodes(ctx: RequestContext, access?: PriceTypeAccessContext): Promise<string[]> {
        return (await this.list(ctx, access)).map(row => row.code);
    }

    async isExternalIdAllowed(ctx: RequestContext, externalId: string | null): Promise<boolean> {
        if (!externalId) return false;
        return (await this.list(ctx)).some(row => row.externalId === externalId);
    }

    async isCodeAllowed(
        ctx: RequestContext,
        code: string,
        access?: PriceTypeAccessContext,
    ): Promise<boolean> {
        return (await this.allowedCodes(ctx, access)).includes(code);
    }

    async assertCodeAllowed(
        ctx: RequestContext,
        code: string,
        access?: PriceTypeAccessContext,
    ): Promise<void> {
        if (!(await this.isCodeAllowed(ctx, code, access))) throw new ForbiddenError();
    }

    assertConfidential(ctx: RequestContext): void {
        if (!this.canReadConfidential(ctx)) throw new ForbiddenError();
    }

    private async branchAllowedIds(ctx: RequestContext): Promise<Set<string> | 'all'> {
        if (ctx.userHasPermissions([CustomPermission.ReadAllCustomerPriceTypes.Permission])) {
            return 'all';
        }
        const { branchId } = await this.accessScope.getActorIdentity(ctx);
        if (!branchId) return new Set();
        const settings = await this.branchSettings.getForBranch(ctx, branchId);
        if (!settings) return new Set();
        const ids = new Set(settings.visiblePriceTypeIds ?? []);
        ids.add(settings.defaultPriceTypeId);
        return ids;
    }
}
