import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Additive to built-in presets (e.g. Orders' SavedViewsPanel); must never replace them.
// pageKey scopes views per page, so new pages need no schema change.
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
