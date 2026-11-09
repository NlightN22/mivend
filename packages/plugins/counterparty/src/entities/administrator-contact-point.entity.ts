import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Administrator } from '@vendure/core';
import { ContactPointLink } from './contact-link.base';

@Entity()
@Index(['administratorId', 'contactPointId'], { unique: true })
export class AdministratorContactPoint extends ContactPointLink {
    constructor(input?: DeepPartial<AdministratorContactPoint>) {
        super(input);
    }

    @Column({ type: 'int' })
    administratorId!: number;

    @ManyToOne(() => Administrator, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'administratorId' })
    owner!: Administrator;
}
