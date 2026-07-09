import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowStepDefinition } from './types';

export interface ParsedWorkflowDefinition {
    requestType: string;
    displayName: string;
    steps: WorkflowStepDefinition[];
}

@Injectable()
export class WorkflowDefinitionService {
    constructor(private connection: TransactionalConnection) {}

    async getDefinition(
        ctx: RequestContext,
        requestType: string,
    ): Promise<ParsedWorkflowDefinition> {
        const row = await this.connection
            .getRepository(ctx, WorkflowDefinition)
            .findOne({ where: { requestType } });
        if (!row) {
            throw new UserInputError(
                `No WorkflowDefinition registered for requestType "${requestType}"`,
            );
        }
        return {
            requestType: row.requestType,
            displayName: row.displayName,
            steps: JSON.parse(row.stepsJson) as WorkflowStepDefinition[],
        };
    }

    async upsertDefinition(
        ctx: RequestContext,
        requestType: string,
        displayName: string,
        steps: WorkflowStepDefinition[],
    ): Promise<WorkflowDefinition> {
        if (steps.length === 0) {
            throw new UserInputError('A WorkflowDefinition must have at least one step');
        }
        const repo = this.connection.getRepository(ctx, WorkflowDefinition);
        let row = await repo.findOne({ where: { requestType } });
        const stepsJson = JSON.stringify([...steps].sort((a, b) => a.order - b.order));
        if (row) {
            row.displayName = displayName;
            row.stepsJson = stepsJson;
        } else {
            row = repo.create({ requestType, displayName, stepsJson });
        }
        return repo.save(row);
    }
}
