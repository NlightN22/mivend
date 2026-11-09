import { VendureEntity } from '@vendure/core';
import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';

import { ContactPoint } from './contact-point.entity';
import { ContactRole } from './contact-role.entity';

// Shared columns of every *_contact_point link table; each subclass adds its own owner FK.
export abstract class ContactPointLink extends VendureEntity {
    @Index()
    @Column({ type: 'int' })
    contactPointId!: number;

    @ManyToOne(() => ContactPoint, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'contactPointId' })
    contactPoint!: ContactPoint;

    @Column({ type: 'int', nullable: true })
    roleId!: number | null;

    @ManyToOne(() => ContactRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'roleId' })
    role!: ContactRole | null;

    @Column({ type: 'boolean', default: false })
    isPrimary!: boolean;
}
