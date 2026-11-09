import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index } from 'typeorm';
import { UuidEntity } from 'shared';

// Rows are seeded by the migration; managers add more, so the list lives in the database.
@Entity()
export class ContactRole extends UuidEntity {
    constructor(input?: DeepPartial<ContactRole>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar' })
    name!: string;
}
