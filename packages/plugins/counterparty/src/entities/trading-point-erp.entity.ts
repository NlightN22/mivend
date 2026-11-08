import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// The last state the ERP stream sent for a point; ids and lists beyond the editable fields are soft, as sent. Only the stream writes it; TradingPoint is mivend's record.
@Entity()
export class TradingPointErp extends VendureEntity {
    constructor(input?: DeepPartial<TradingPointErp>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;

    @Column({ type: 'varchar', nullable: true })
    address!: string | null;

    @Column({ type: 'float', nullable: true })
    latitude!: number | null;

    @Column({ type: 'float', nullable: true })
    longitude!: number | null;

    @Column({ type: 'varchar', nullable: true })
    workingHours!: string | null;

    @Column({ type: 'varchar', nullable: true })
    contactPhone!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar', nullable: true })
    code!: string | null;

    @Column({ type: 'varchar', nullable: true })
    regionId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    storageStock!: string | null;

    @Column({ type: 'varchar', nullable: true })
    loyalty!: string | null;

    @Column({ type: 'float', nullable: true })
    area!: number | null;

    @Column({ type: 'varchar', nullable: true })
    classification!: string | null;

    @Column({ type: 'boolean', nullable: true })
    hasCompetitors!: boolean | null;

    @Column({ type: 'varchar', nullable: true })
    mainManagerId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    bankAccountId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    internalTransferPointId!: string | null;

    @Column({ type: 'float', nullable: true })
    accuracyRadius!: number | null;

    @Column({ type: 'text', nullable: true })
    productGroupIds!: string | null;

    @Column({ type: 'text', nullable: true })
    managerIds!: string | null;

    @Column({ type: 'text', nullable: true })
    pointTypeIds!: string | null;

    @Column({ type: 'text', nullable: true })
    salesChannels!: string | null;

    @Column({ type: 'text', nullable: true })
    contactInfos!: string | null;
}
