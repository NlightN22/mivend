import { DeepPartial, ID } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { PriceType } from './price-type.entity';

@Entity()
export class CustomerPriceType extends VendureEntity {
    constructor(input?: DeepPartial<CustomerPriceType>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    customerId!: ID;

    @ManyToOne(() => PriceType, { eager: true, nullable: false })
    @JoinColumn()
    priceType!: PriceType;
}
