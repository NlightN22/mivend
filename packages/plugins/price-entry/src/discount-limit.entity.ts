import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Largest line discount one employee may leave on a line, as a percent of the line's reference price (LineDiscountService).
// scopeKind 'all' = every product, else scopeRef is a manufacturer or category ERP id (see discount-limit-scope.ts).
@Entity()
@Index(['administratorId', 'scopeKind', 'scopeRef'], { unique: true })
export class DiscountLimit extends UuidEntity {
    constructor(input?: DeepPartial<DiscountLimit>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    administratorId!: string;

    @Column({ type: 'varchar', default: 'all' })
    scopeKind!: string;

    @Column({ type: 'varchar', default: '' })
    scopeRef!: string;

    @Column({ type: 'double precision' })
    maxDiscountPercent!: number;
}
