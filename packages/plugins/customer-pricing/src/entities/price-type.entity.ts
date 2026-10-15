import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, OneToMany } from 'typeorm';

import { CustomerPriceType } from './customer-price-type.entity';

@Entity()
export class PriceType extends VendureEntity {
    constructor(input?: DeepPartial<PriceType>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // Nullable and unique-when-present: manager-created price types never get an ERP id.
    // The value must match PriceChanged.priceTypeId, which references it.
    @Index({ unique: true })
    @Column({ type: 'varchar', nullable: true })
    externalId?: string | null;

    @OneToMany(() => CustomerPriceType, cpt => cpt.priceType)
    customerAssignments!: CustomerPriceType[];
}
