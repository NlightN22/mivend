import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    EventBus,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    ApprovalRequest,
    ApprovalRequestService,
    ApprovalStepDecision,
} from '@mivend/plugin-approval-workflow';

import { CreditTermGateService } from './credit-term-gate.service';
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

// Manager initiates; a department head may approve within their own configured limit
// (a single-step chain, requestType "creditTermApproval") or, once the requested extension
// exceeds it, the request instead goes through security review then the general director
// (a two-step chain, requestType "creditTermApprovalEscalated") — two different
// WorkflowDefinition rows selected by CreditTermGateService, not a branch inside one chain.
// See docs/access-control.md layer 5.
@Injectable()
export class CreditTermService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
        private gate: CreditTermGateService,
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

        const decision = await this.gate.evaluate(
            ctx,
            input.requestedExtraDays,
            input.requestedAmount ?? null,
        );
        const requestType =
            decision === 'within-limit' ? WITHIN_LIMIT_REQUEST_TYPE : ESCALATED_REQUEST_TYPE;

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

    // Composes the generic engine with the counterparty domain effect — same pattern as
    // PriceAdjustmentService/DiscountGrantService in plugin-price-entry. The engine itself
    // never learns what "creditTermApproval(Escalated)" means.
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
