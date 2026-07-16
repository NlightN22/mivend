import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type IdempotencyRequestStatus = 'inProgress' | 'completed' | 'failed';

@Entity()
@Index(['callerId', 'idempotencyKey'], { unique: true })
export class IdempotencyKey extends VendureEntity {
    constructor(input?: DeepPartial<IdempotencyKey>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    callerId!: string;

    @Column({ type: 'varchar' })
    idempotencyKey!: string;

    @Column({ type: 'varchar' })
    requestHash!: string;

    @Column({ type: 'text', nullable: true })
    response!: string | null;

    @Column({ type: 'varchar', default: 'inProgress' })
    status!: IdempotencyRequestStatus;
}
