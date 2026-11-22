import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Reference cache of the `currency` stream (CurrencyChanged); the id space of every currency_id in other events.
@Entity()
export class CurrencyRecord extends VendureEntity {
    constructor(input?: DeepPartial<CurrencyRecord>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    // Alphabetic code (CurrencyChanged.name).
    @Column({ type: 'varchar' })
    code!: string;

    // Numeric ISO code (CurrencyChanged.code); null when 1C left it empty.
    @Column({ type: 'varchar', nullable: true })
    numericCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'boolean', default: false })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
