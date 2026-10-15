import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { Consequence } from '../types';

@Entity()
@Index(['checkCode', 'stage'], { unique: true })
export class CheckPolicy extends UuidEntity {
    constructor(input?: DeepPartial<CheckPolicy>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    checkCode!: string;

    @Column({ type: 'varchar' })
    stage!: string;

    @Column({ type: 'varchar' })
    consequence!: Consequence;

    @Column({ type: 'varchar', nullable: true })
    recipient!: string | null;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;
}
