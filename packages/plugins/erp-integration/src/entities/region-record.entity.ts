import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Reference cache of the `region` stream (RegionChanged); parentId is a soft link, no FK.
@Entity()
export class RegionRecord extends VendureEntity {
    constructor(input?: DeepPartial<RegionRecord>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar', nullable: true })
    regionCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    addressCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    parentId!: string | null;

    @Column({ type: 'boolean', default: false })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
