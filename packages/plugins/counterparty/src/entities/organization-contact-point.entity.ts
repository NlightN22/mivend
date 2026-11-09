import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ContactPointLink } from './contact-link.base';

@Entity()
@Index(['organizationId', 'contactPointId'], { unique: true })
export class OrganizationContactPoint extends ContactPointLink {
    constructor(input?: DeepPartial<OrganizationContactPoint>) {
        super(input);
    }

    @Column({ type: 'int' })
    organizationId!: number;

    // Referenced by name: the entity lives in the documents plugin, which depends on this one.
    @ManyToOne('OrganizationRequisites', { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    owner!: unknown;
}
