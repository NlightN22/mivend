import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Chain definitions live as data, one row per requestType, never hardcoded in the plugin.
// Edit only via upsertWorkflowDefinition, which is gated by ManageApprovalWorkflows.
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
