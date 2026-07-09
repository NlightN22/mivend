import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';

// Read-only queries for the ApprovalRequest/ApprovalStep audit trail — kept separate from
// ApprovalRequestService (which owns the create/decide/escalate transitions) so that
// resolver field lookups don't pull in the XState transition logic.
@Injectable()
export class ApprovalStepService {
    constructor(private connection: TransactionalConnection) {}

    async findRequest(ctx: RequestContext, id: ID): Promise<ApprovalRequest | null> {
        return this.connection.getRepository(ctx, ApprovalRequest).findOne({ where: { id } });
    }

    async findSteps(ctx: RequestContext, approvalRequestId: ID): Promise<ApprovalStep[]> {
        return this.connection.getRepository(ctx, ApprovalStep).find({
            where: { approvalRequestId: String(approvalRequestId) },
            order: { stepIndex: 'ASC' },
        });
    }
}
