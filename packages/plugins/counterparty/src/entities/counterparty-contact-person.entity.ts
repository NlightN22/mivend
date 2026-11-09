import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { ContactPerson } from './contact-person.entity';
import { ContactRole } from './contact-role.entity';
import { Counterparty } from './counterparty.entity';

// The only ERP-backed person link: a counterparty-contact event belongs to a counterparty, never to a point.
@Entity()
@Index(['counterpartyId', 'contactPersonId'], { unique: true })
export class CounterpartyContactPerson extends VendureEntity {
    constructor(input?: DeepPartial<CounterpartyContactPerson>) {
        super(input);
    }

    @Column({ type: 'int' })
    counterpartyId!: number;

    @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'counterpartyId' })
    counterparty!: Counterparty;

    @Column({ type: 'int' })
    contactPersonId!: number;

    @ManyToOne(() => ContactPerson, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'contactPersonId' })
    contactPerson!: ContactPerson;

    @Column({ type: 'int', nullable: true })
    roleId!: number | null;

    @ManyToOne(() => ContactRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'roleId' })
    role!: ContactRole | null;

    @Column({ type: 'boolean', default: false })
    isPrimary!: boolean;
}
