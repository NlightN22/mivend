import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ProductChanged.manufacturer is an ERP directory GUID, not the display name (OpenAPI doc is wrong).
// Name backfills from attributes['Производитель'].raw; never cleared to null by later events.
@Entity()
export class Manufacturer extends VendureEntity {
    constructor(input?: DeepPartial<Manufacturer>) {
        super(input);
    }

    // ERP directory GUID is the stable identity; the display name can change, so never key on it.
    // Same own-id plus indexed erpId pattern as Warehouse and ProductTaxCodeFlag.
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    externalId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;
}
