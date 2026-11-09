import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ContactPerson } from './contact-person.entity';
import { ContactPointLink } from './contact-link.base';

@Entity()
@Index(['contactPersonId', 'contactPointId'], { unique: true })
export class ContactPersonContactPoint extends ContactPointLink {
    constructor(input?: DeepPartial<ContactPersonContactPoint>) {
        super(input);
    }

    @Column({ type: 'int' })
    contactPersonId!: number;

    @ManyToOne(() => ContactPerson, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'contactPersonId' })
    owner!: ContactPerson;
}
