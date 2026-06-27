import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { TradingPoint } from './trading-point.entity';

@Entity()
export class ContactPerson extends VendureEntity {
    constructor(input?: DeepPartial<ContactPerson>) {
        super(input);
    }

    @ManyToOne(() => TradingPoint, (tp: TradingPoint) => tp.contacts, {
        nullable: false,
        onDelete: 'CASCADE',
    })
    @JoinColumn()
    tradingPoint!: TradingPoint;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;

    @Column({ type: 'varchar', nullable: true })
    email!: string | null;

    @Column({ type: 'boolean', default: false })
    isPrimary!: boolean;
}
