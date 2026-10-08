import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// One StorageLocationChanged row that carries an organization. The winner per product (lowest
// priority, then lowest entityId) is derived from these rows into ProductVariant.organizationId.
@Entity()
@Index(['productId'])
export class StorageLocationAssignment extends VendureEntity {
    constructor(input?: DeepPartial<StorageLocationAssignment>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    productId!: string;

    @Column({ type: 'varchar' })
    organizationErpId!: string;

    @Column({ type: 'int', default: 0 })
    priority!: number;
}
