import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Mirrors CreditTermLimit (@mivend/plugin-access-control): keep in sync; it is data, not code.
// One row per role code; no limit applies until an admin sets one (no default).
@Entity()
export class ReservationExtensionLimit extends VendureEntity {
    constructor(input?: DeepPartial<ReservationExtensionLimit>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    roleCode!: string;

    @Column({ type: 'int' })
    maxExtraDays!: number;
}
