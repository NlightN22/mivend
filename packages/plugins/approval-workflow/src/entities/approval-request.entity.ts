import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, VersionColumn } from 'typeorm';

// status is a plain varchar, not a hardcoded GraphQL enum — interpreted by the service layer,
// per AGENTS.md ("Reservation statuses — stored as varchar"). Values: pending/approved/
// rejected/cancelled.
@Entity()
export class ApprovalRequest extends VendureEntity {
    constructor(input?: DeepPartial<ApprovalRequest>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    requestType!: string;

    // JSON snapshot of what is being approved (e.g. a price adjustment or discount grant)
    @Column({ type: 'text' })
    payload!: string;

    @Column({ type: 'varchar', default: 'pending' })
    status!: string;

    @Column({ type: 'int', default: 0 })
    currentStepIndex!: number;

    @Column({ type: 'varchar', nullable: true })
    requestedByAdministratorId!: string | null;

    // Persisted XState snapshot — rehydrated into a fresh actor on every decide(), never held
    // in memory across requests. See docs/access-control.md, layer 5.
    @Column({ type: 'text', nullable: true })
    xstateSnapshot!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    decidedAt!: Date | null;

    // Optimistic locking for concurrent decide() calls on the same request — see
    // docs/access-control.md, "Optimistic locking on every transition".
    @VersionColumn()
    version!: number;
}
