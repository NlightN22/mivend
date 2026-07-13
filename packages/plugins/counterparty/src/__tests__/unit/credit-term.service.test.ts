import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, UserInputError } from '@vendure/core';
import type { EventBus, RequestContext, TransactionalConnection } from '@vendure/core';
import type { ApprovalRequestService } from '@mivend/plugin-approval-workflow';

import { CreditTermService } from '../../credit-term.service';
import { CreditTermGateService } from '../../credit-term-gate.service';
import { CounterpartyService } from '../../counterparty.service';

function mockCtx(permissions: string[]): RequestContext {
    return {
        userHasPermissions: (p: string[]) => p.some(x => permissions.includes(x)),
    } as unknown as RequestContext;
}

const validInput = {
    counterpartyErpId: 'cnt-001',
    requestedExtraDays: 10,
    justification: 'client requested extended terms for a large order',
};

describe('CreditTermService', () => {
    let counterpartyRepo: {
        findOneOrFail: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    let counterpartyService: { findByErpId: ReturnType<typeof vi.fn> };
    let gate: { evaluate: ReturnType<typeof vi.fn> };
    let approvalRequestService: {
        createRequest: ReturnType<typeof vi.fn>;
        decide: ReturnType<typeof vi.fn>;
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let service: CreditTermService;

    beforeEach(() => {
        counterpartyRepo = {
            findOneOrFail: vi.fn(async () => ({ id: '1', erpId: 'cnt-001' })),
            save: vi.fn(async (x: unknown) => x),
        };
        const connection = { getRepository: () => counterpartyRepo };
        counterpartyService = { findByErpId: vi.fn(async () => ({ id: '1', erpId: 'cnt-001' })) };
        gate = { evaluate: vi.fn() };
        approvalRequestService = {
            createRequest: vi.fn(async () => ({ id: 'req-1' })),
            decide: vi.fn(),
        };
        eventBus = { publish: vi.fn() };
        service = new CreditTermService(
            connection as unknown as TransactionalConnection,
            counterpartyService as unknown as CounterpartyService,
            gate as unknown as CreditTermGateService,
            approvalRequestService as unknown as ApprovalRequestService,
            eventBus as unknown as EventBus,
        );
    });

    describe('requestExtension', () => {
        it('routes to the single-step chain when the gate says within-limit', async () => {
            gate.evaluate.mockResolvedValue('within-limit');
            const ctx = mockCtx(['RequestCreditTermApproval']);

            await service.requestExtension(ctx, validInput);

            expect(approvalRequestService.createRequest).toHaveBeenCalledWith(
                ctx,
                'creditTermApproval',
                expect.objectContaining({ counterpartyErpId: 'cnt-001', requestedExtraDays: 10 }),
            );
        });

        it('routes to the escalated two-step chain when the gate says exceeds-limit', async () => {
            gate.evaluate.mockResolvedValue('exceeds-limit');
            const ctx = mockCtx(['RequestCreditTermApproval']);

            await service.requestExtension(ctx, validInput);

            expect(approvalRequestService.createRequest).toHaveBeenCalledWith(
                ctx,
                'creditTermApprovalEscalated',
                expect.anything(),
            );
        });

        it('rejects a caller without RequestCreditTermApproval', async () => {
            gate.evaluate.mockResolvedValue('within-limit');
            const ctx = mockCtx([]);
            await expect(service.requestExtension(ctx, validInput)).rejects.toThrow(ForbiddenError);
            expect(approvalRequestService.createRequest).not.toHaveBeenCalled();
        });

        it('rejects an empty justification', async () => {
            const ctx = mockCtx(['RequestCreditTermApproval']);
            await expect(
                service.requestExtension(ctx, { ...validInput, justification: '  ' }),
            ).rejects.toThrow(UserInputError);
        });

        it('rejects a non-positive requestedExtraDays', async () => {
            const ctx = mockCtx(['RequestCreditTermApproval']);
            await expect(
                service.requestExtension(ctx, { ...validInput, requestedExtraDays: 0 }),
            ).rejects.toThrow(UserInputError);
        });

        it('rejects when the counterparty does not exist', async () => {
            counterpartyService.findByErpId.mockResolvedValue(null);
            const ctx = mockCtx(['RequestCreditTermApproval']);
            await expect(service.requestExtension(ctx, validInput)).rejects.toThrow(UserInputError);
        });
    });

    describe('decideAndApply', () => {
        it('applies the override and publishes CreditTermApprovedEvent once approved', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'approved',
                requestType: 'creditTermApproval',
                payload: JSON.stringify({
                    counterpartyErpId: 'cnt-001',
                    requestedExtraDays: 10,
                    requestedAmount: null,
                    justification: 'x',
                }),
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'approved', 'ok');

            expect(counterpartyRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ creditTermOverrideExtraDays: 10 }),
            );
            expect(eventBus.publish).toHaveBeenCalled();
        });

        it('does nothing when the request is rejected', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'rejected',
                requestType: 'creditTermApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'rejected');

            expect(counterpartyRepo.save).not.toHaveBeenCalled();
            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('does nothing for an unrelated requestType', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-2',
                status: 'approved',
                requestType: 'discountGrantApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-2', 'approved');

            expect(counterpartyRepo.save).not.toHaveBeenCalled();
        });
    });
});
