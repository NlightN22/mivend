import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// User-created named view over a page's filter/column state — additive to any fixed presets
// the page already renders (e.g. manager portal Orders' SavedViewsPanel), never a replacement.
// pageKey generalizes this beyond Orders (e.g. 'invoices', 'customers') without a schema change.
@Entity()
@Index(['administratorId', 'pageKey'])
export class SavedTableView extends VendureEntity {
    constructor(input?: DeepPartial<SavedTableView>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    administratorId!: string;

    @Column({ type: 'varchar' })
    pageKey!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'text' })
    filters!: string;

    @Column({ type: 'simple-json' })
    visibleColumns!: string[];
}
