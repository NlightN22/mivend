import { ErpMirrorEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// The last state the ERP stream sent for a counterparty; only the stream writes it, Counterparty is mivend's record.
@Entity()
export class CounterpartyErp extends ErpMirrorEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    inn!: string | null;

    @Column({ type: 'varchar', nullable: true })
    kpp!: string | null;

    @Column({ type: 'varchar', nullable: true })
    ogrnip!: string | null;

    @Column({ type: 'varchar', nullable: true })
    okpo!: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalType!: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalFormId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    regionId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalAddress!: string | null;

    @Column({ type: 'varchar', nullable: true })
    factualAddress!: string | null;

    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;

    @Column({ type: 'varchar', nullable: true })
    officialEmail!: string | null;

    @Column({ type: 'varchar', nullable: true })
    erpGroupLabel!: string | null;

    @Column({ type: 'varchar', nullable: true })
    managerId!: string | null;

    @Column({ type: 'text', nullable: true })
    managerIds!: string | null;

    @Column({ type: 'text', nullable: true })
    contactInfos!: string | null;
}
