import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import {
    ApprovalRequest,
    ApprovalRequestService,
    ApprovalStepDecision,
} from '@mivend/plugin-approval-workflow';
import { ChecksService, MANAGER_STAGES, MANAGER_SUBJECT_TYPE } from '@mivend/plugin-checks';
import type { ManagerActionSubject } from '@mivend/plugin-checks';

import type { CreditTermParams } from './credit-term-extension.check';
import { CreditTermApprovedEvent } from './credit-term.events';
import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyService } from './counterparty.service';

const WITHIN_LIMIT_REQUEST_TYPE = 'creditTermApproval';
const ESCALATED_REQUEST_TYPE = 'creditTermApprovalEscalated';

export interface CreditTermRequestInput {
    counterpartyErpId: string;
    requestedExtraDays: number;
    requestedAmount?: number | null;
    justification: string;
}

interface CreditTermPayload {
    counterpartyErpId: string;
    requestedExtraDays: number;
    requestedAmount: number | null;
    justification: string;
}

// Two WorkflowDefinition rows, chosen by the `manager.credit-term-extension` policy; not one branching chain.
@Injectable()
export class CreditTermService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
        private accessScope: AccessScopeService,
        private checks: ChecksService,
        private approvalRequestService: ApprovalRequestService,
        private eventBus: EventBus,
    ) {}

    async requestExtension(
        ctx: RequestContext,
        input: CreditTermRequestInput,
    ): Promise<ApprovalRequest> {
        if (!ctx.userHasPermissions([CustomPermission.RequestCreditTermApproval.Permission])) {
            throw new ForbiddenError();
        }
        if (!input.justification || input.justification.trim().length === 0) {
            throw new UserInputError(
                'justification is required to request a credit-term extension',
            );
        }
        if (input.requestedExtraDays <= 0) {
            throw new UserInputError('requestedExtraDays must be positive');
        }

        const counterparty = await this.counterpartyService.findByErpId(
            ctx,
            input.counterpartyErpId,
        );
        if (!counterparty) {
            throw new UserInputError(`Counterparty not found: erpId=${input.counterpartyErpId}`);
        }

        const actor = await this.accessScope.getActorIdentity(ctx);
        const subject: ManagerActionSubject<CreditTermParams> = {
            ...actor,
            params: {
                requestedExtraDays: input.requestedExtraDays,
                requestedAmount: input.requestedAmount ?? null,
            },
        };
        const { strongestConsequence } = await this.checks.evaluate(
            ctx,
            MANAGER_SUBJECT_TYPE,
            subject,
            MANAGER_STAGES.extendCreditTerm,
        );
        if (strongestConsequence === 'block') {
            throw new ForbiddenError();
        }
        const requestType =
            strongestConsequence === 'require-approval'
                ? ESCALATED_REQUEST_TYPE
                : WITHIN_LIMIT_REQUEST_TYPE;

        const payload: CreditTermPayload = {
            counterpartyErpId: input.counterpartyErpId,
            requestedExtraDays: input.requestedExtraDays,
            requestedAmount: input.requestedAmount ?? null,
            justification: input.justification,
        };
        return this.approvalRequestService.createRequest(
            ctx,
            requestType,
            payload as unknown as Record<string, unknown>,
        );
    }

    // The engine stays domain-agnostic: this service composes the counterparty effect on top of it.
    // Keep requestType names out of the engine; they are interpreted only here.
    async decideAndApply(
        ctx: RequestContext,
        requestId: ID,
        decision: ApprovalStepDecision,
        comment?: string,
    ): Promise<ApprovalRequest> {
        const request = await this.approvalRequestService.decide(ctx, requestId, decision, comment);
        if (
            request.status === 'approved' &&
            (request.requestType === WITHIN_LIMIT_REQUEST_TYPE ||
                request.requestType === ESCALATED_REQUEST_TYPE)
        ) {
            const payload = JSON.parse(request.payload) as CreditTermPayload;
            const repo = this.connection.getRepository(ctx, Counterparty);
            const counterparty = await repo.findOneOrFail({
                where: { erpId: payload.counterpartyErpId },
            });
            counterparty.creditTermOverrideExtraDays = payload.requestedExtraDays;
            await repo.save(counterparty);
            this.eventBus.publish(
                new CreditTermApprovedEvent(
                    ctx,
                    String(counterparty.id),
                    payload.requestedExtraDays,
                    String(request.id),
                ),
            );
        }
        return request;
    }
}
