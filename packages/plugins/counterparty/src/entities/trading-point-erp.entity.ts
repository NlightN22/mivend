import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// The last state the ERP stream sent for a point. Only the stream writes it; TradingPoint is mivend's record.
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
}
