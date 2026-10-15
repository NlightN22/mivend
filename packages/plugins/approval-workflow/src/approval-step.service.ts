import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';

// Kept separate from ApprovalRequestService so resolver field lookups don't import XState
// transition logic; keep transitions out of this module.
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
