import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type SavedTableViewScope = 'PERSONAL' | 'SHARED';

// A table view per list; pageKey is the list's viewsKey, so new lists need no schema change.
// Shared views are visible to every staff member; administratorId is then only the author.
@Entity()
@Index(['administratorId', 'pageKey'])
@Index(['scope', 'pageKey'])
@Index(['pageKey'], { unique: true, where: '"isDefault" = true' })
export class SavedTableView extends UuidEntity {
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

    @Column({ type: 'varchar', default: 'PERSONAL' })
    scope!: SavedTableViewScope;

    // At most one shared view per list; the partial unique index backs the service's lock.
    @Column({ type: 'boolean', default: false })
    isDefault!: boolean;
}
