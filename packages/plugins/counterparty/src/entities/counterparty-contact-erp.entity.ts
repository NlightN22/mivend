import { ErpMirrorEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Last state of the `counterparty-contact` stream; counterpartyId is a soft link (no FK), contactInfos is the sent list as JSON text.
@Entity()
export class CounterpartyContactErp extends ErpMirrorEntity {
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
