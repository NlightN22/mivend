import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { ForbiddenError, RequestContext } from '@vendure/core';
import { PriceTypeAccessService } from '@mivend/plugin-access-control';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStepService } from './approval-step.service';
import { ApprovalListOptions } from './types';
import { isRequestVisible } from './payload-price-type-gate';
import { ApprovalScopeRegistry } from './approval-scope.registry';

// Read-path gate: a request whose payload names a price type is visible only to holders of that type.
@Injectable()
export class ApprovalReadAccessService {
    constructor(
        private priceTypeAccess: PriceTypeAccessService,
        private approvalStepService: ApprovalStepService,
        private scope: ApprovalScopeRegistry,
    ) {}

    async withGate(
        ctx: RequestContext,
        options: ApprovalListOptions = {},
    ): Promise<ApprovalListOptions> {
        return { ...options, allowedPriceTypeCodes: await this.priceTypeAccess.allowedCodes(ctx) };
    }

    async visibleOrNull(
        ctx: RequestContext,
        request: ApprovalRequest | null,
    ): Promise<ApprovalRequest | null> {
        if (!request) return null;
        const allowed = await this.priceTypeAccess.allowedCodes(ctx);
        if (!isRequestVisible(request, allowed)) return null;
        return (await this.scope.isVisible(ctx, request.id)) ? request : null;
    }

    async assertVisible(ctx: RequestContext, requestId: ID): Promise<void> {
        const request = await this.approvalStepService.findRequest(ctx, requestId);
        if (request && !(await this.visibleOrNull(ctx, request))) throw new ForbiddenError();
    }
}
