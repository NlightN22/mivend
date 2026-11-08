import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Last state of the `counterparty-contact` stream; counterpartyId is a soft link (no FK), contactInfos is the sent list as JSON text.
@Entity()
export class CounterpartyContactErp extends VendureEntity {
    constructor(input?: DeepPartial<CounterpartyContactErp>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Index()
    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;

    @Column({ type: 'varchar', nullable: true })
    position!: string | null;

    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;

    @Column({ type: 'varchar', nullable: true })
    email!: string | null;

    @Column({ type: 'text', nullable: true })
    contactInfos!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
