import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// How many extra days a role may add to a reservation on their own authority — mirrors
// CreditTermLimit (@mivend/plugin-access-control) exactly: data, not code, one row per role
// code, no default limit until an admin sets one (see docs/architecture.md "managers can
// extend up to a configured maximum without additional approval").
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
