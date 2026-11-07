import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Largest line discount a staff role may leave on a line, as a percent of the line's reference price (LineDiscountService).
// groupRef '' = every product, else a manufacturer or category ERP id; no row for a role and product = no limit.
@Entity()
@Index(['roleCode', 'groupRef'], { unique: true })
export class DiscountLimit extends UuidEntity {
    constructor(input?: DeepPartial<DiscountLimit>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    roleCode!: string;

    @Column({ type: 'varchar', default: '' })
    groupRef!: string;

    @Column({ type: 'double precision' })
    maxDiscountPercent!: number;
}
