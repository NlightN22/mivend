import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity } from 'typeorm';

@Entity()
export class ActingTicket extends UuidEntity {
    constructor(input?: DeepPartial<ActingTicket>) {
        super(input);
    }

    @Column({ type: 'varchar', unique: true })
    tokenHash!: string;

    @Column({ type: 'varchar' })
    administratorId!: string;

    @Column({ type: 'varchar' })
    parentSessionId!: string;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar' })
    customerId!: string;

    @Column({ type: 'varchar', nullable: true })
    tradingPointId!: string | null;

    @Column({ type: 'timestamp' })
    expiresAt!: Date;

    @Column({ type: 'timestamp', nullable: true })
    usedAt!: Date | null;
}
