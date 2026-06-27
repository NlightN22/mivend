import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { Counterparty } from './counterparty.entity';
import { ContactPerson } from './contact-person.entity';

@Entity()
export class TradingPoint extends VendureEntity {
    constructor(input?: DeepPartial<TradingPoint>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn()
    counterparty!: Counterparty;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar' })
    address!: string;

    @Column({ type: 'float', nullable: true })
    latitude!: number | null;

    @Column({ type: 'float', nullable: true })
    longitude!: number | null;

    @Column({ type: 'varchar', nullable: true })
    workingHours!: string | null;

    @Column({ type: 'varchar', nullable: true })
    deliveryComment!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @OneToMany(() => ContactPerson, (cp: ContactPerson) => cp.tradingPoint, {
        cascade: true,
        eager: true,
    })
    contacts!: ContactPerson[];
}
