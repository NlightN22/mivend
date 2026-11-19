import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Immutable once inserted: a change is a new version, never an update.
@Entity()
@Index(['kind', 'version', 'locale'], { unique: true })
export class LegalDocumentVersion extends UuidEntity {
    constructor(input?: DeepPartial<LegalDocumentVersion>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    kind!: string;

    @Column({ type: 'int' })
    version!: number;

    @Column({ type: 'varchar' })
    locale!: string;

    @Column({ type: 'varchar' })
    title!: string;

    @Column({ type: 'text' })
    template!: string;

    @Column({ type: 'text' })
    body!: string;

    @Column({ type: 'timestamptz' })
    effectiveDate!: Date;

    @Column({ type: 'boolean' })
    requiresReacceptance!: boolean;
}
