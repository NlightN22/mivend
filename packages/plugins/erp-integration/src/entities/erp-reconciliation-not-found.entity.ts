import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// An id upstream answered not_found for: a legitimate difference, not asked again.
@Entity()
@Index(['aggregateType', 'entityId'], { unique: true })
export class ErpReconciliationNotFound extends UuidEntity {
    constructor(input?: DeepPartial<ErpReconciliationNotFound>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    aggregateType!: string;

    @Column({ type: 'varchar' })
    entityId!: string;
}
