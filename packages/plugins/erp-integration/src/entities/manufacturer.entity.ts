import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ProductChanged's top-level `manufacturer` field is a 1C directory GUID, NOT a display name —
// confirmed live with Search Platform (issue #116): the field's OpenAPI description
// ("Manufacturer/brand name") is misleading, and the same GUID also appears as the `valueRef`...
// no — as the value of `attributes['Производитель'].raw` alongside the human-readable name,
// which is what backfills `name` below opportunistically (see ManufacturerService.upsert).
// `name` is nullable and never cleared back to null just because a later event omits it.
@Entity()
export class Manufacturer extends VendureEntity {
    constructor(input?: DeepPartial<Manufacturer>) {
        super(input);
    }

    // The 1C directory GUID (ProductChanged.manufacturer) — stable identity, never the display
    // name. Same "own Vendure id + separate indexed ERP id" convention as every other entity in
    // this plugin (Warehouse.erpId, ProductTaxCodeFlag.externalProductId, ...).
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    externalId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;
}
