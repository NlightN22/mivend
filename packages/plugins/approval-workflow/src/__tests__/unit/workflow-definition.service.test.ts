import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { WorkflowDefinitionService } from '../../workflow-definition.service';
import { WorkflowStepDefinition } from '../../types';

describe('WorkflowDefinitionService', () => {
    let repo: {
        findOne: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
    };
    let service: WorkflowDefinitionService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = {
            findOne: vi.fn(),
            create: vi.fn((x: unknown) => x),
            save: vi.fn(async (x: unknown) => x),
        };
        const connection = { getRepository: () => repo };
        service = new WorkflowDefinitionService(connection as unknown as TransactionalConnection);
    });

    it('parses stepsJson back into an array on getDefinition', async () => {
        const steps: WorkflowStepDefinition[] = [
            {
                order: 1,
                role: 'SalesDeptHead',
                requiredPermission: 'ApproveDiscountRequest',
                escalatesTo: [],
            },
        ];
        repo.findOne.mockResolvedValue({
            requestType: 'priceAdjustmentApproval',
            displayName: 'Price adjustment',
            stepsJson: JSON.stringify(steps),
        });
        const definition = await service.getDefinition(ctx, 'priceAdjustmentApproval');
        expect(definition.steps).toEqual(steps);
    });

    it('throws UserInputError for an unregistered requestType', async () => {
        repo.findOne.mockResolvedValue(null);
        await expect(service.getDefinition(ctx, 'unknownType')).rejects.toThrow();
    });

    it('rejects upserting a WorkflowDefinition with zero steps', async () => {
        await expect(service.upsertDefinition(ctx, 'x', 'X', [])).rejects.toThrow();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('sorts steps by order before persisting', async () => {
        repo.findOne.mockResolvedValue(null);
        const steps: WorkflowStepDefinition[] = [
            { order: 2, role: 'B', requiredPermission: 'P', escalatesTo: [] },
            { order: 1, role: 'A', requiredPermission: 'P', escalatesTo: [] },
        ];
        await service.upsertDefinition(ctx, 'x', 'X', steps);
        const created = repo.create.mock.calls[0][0] as { stepsJson: string };
        expect(JSON.parse(created.stepsJson).map((s: WorkflowStepDefinition) => s.role)).toEqual([
            'A',
            'B',
        ]);
    });
});
