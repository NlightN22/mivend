import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { ApprovalRequest } from './entities/approval-request.entity';

// Whether the deciding administrator may approve this request, beyond the step's required permission.
export type ApprovalEligibilityRule = (
    ctx: RequestContext,
    request: Pick<ApprovalRequest, 'id' | 'requestType' | 'payload'>,
) => Promise<boolean>;

// A request type without a rule is decided by the step permission alone. Rules run on approvals only.
@Injectable()
export class ApprovalEligibilityRegistry {
    private readonly rules = new Map<string, ApprovalEligibilityRule>();

    register(requestType: string, rule: ApprovalEligibilityRule): void {
        this.rules.set(requestType, rule);
    }

    async mayApprove(ctx: RequestContext, request: ApprovalRequest): Promise<boolean> {
        const rule = this.rules.get(request.requestType);
        return rule ? rule(ctx, request) : true;
    }
}
