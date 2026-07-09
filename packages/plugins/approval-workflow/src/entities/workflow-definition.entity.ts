import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Chain definitions are data, not code — one row per requestType, edited via
// upsertWorkflowDefinition (gated by ManageApprovalWorkflows), never hardcoded in the plugin.
// See docs/ai/manager-portal-concept.md §4.4.
@Entity()
export class WorkflowDefinition extends VendureEntity {
    constructor(input?: DeepPartial<WorkflowDefinition>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    requestType!: string;

    @Column({ type: 'varchar' })
    displayName!: string;

    // JSON-encoded WorkflowStepDefinition[] — see types.ts
    @Column({ type: 'text' })
    stepsJson!: string;
}
