import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Audit trail for each step of an ApprovalRequest — one row per stepIndex, created lazily
// when a decision or escalation first happens on that step.
@Entity()
@Index(['approvalRequestId', 'stepIndex'], { unique: true })
export class ApprovalStep extends VendureEntity {
    constructor(input?: DeepPartial<ApprovalStep>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    approvalRequestId!: string;

    @Column({ type: 'int' })
    stepIndex!: number;

    @Column({ type: 'varchar' })
    requiredRole!: string;

    @Column({ type: 'varchar', nullable: true })
    approverAdministratorId!: string | null;

    // Escalation replaces the executor on the current step — it never creates a parallel step
    // or transitions the state machine. See docs/ai/manager-portal-concept.md §4.3.
    @Column({ type: 'boolean', default: false })
    wasEscalated!: boolean;

    @Column({ type: 'varchar', nullable: true })
    escalatedByAdministratorId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    escalatedToAdministratorId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    decision!: string | null;

    @Column({ type: 'text', nullable: true })
    comment!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    decidedAt!: Date | null;
}
