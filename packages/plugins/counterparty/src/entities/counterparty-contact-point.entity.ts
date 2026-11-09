import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Counterparty } from './counterparty.entity';
import { ContactPointLink } from './contact-link.base';

@Entity()
@Index(['counterpartyId', 'contactPointId'], { unique: true })
export class CounterpartyContactPoint extends ContactPointLink {
    constructor(input?: DeepPartial<CounterpartyContactPoint>) {
        super(input);
    }

    @Column({ type: 'int' })
    counterpartyId!: number;

    @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'counterpartyId' })
    owner!: Counterparty;
}
