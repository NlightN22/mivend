import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity } from 'typeorm';
import { UuidEntity } from 'shared';

export type ContactPointType = 'phone' | 'email' | 'address' | 'web' | 'other';
export type ContactSource = 'erp' | 'manual';

// One channel. The owner and the primary flag live on the *_contact_point link row that points at it.
@Entity()
export class ContactPoint extends UuidEntity {
    constructor(input?: DeepPartial<ContactPoint>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    type!: ContactPointType;

    // Exactly as entered or received.
    @Column({ type: 'varchar' })
    value!: string;

    // E.164 for a phone, lower-case for an e-mail; null when the value is unusable.
    @Column({ type: 'varchar', nullable: true })
    normalizedValue!: string | null;

    @Column({ type: 'boolean', default: true })
    isUsable!: boolean;

    // The ERP kind name, free text.
    @Column({ type: 'varchar', nullable: true })
    label!: string | null;

    @Column({ type: 'varchar', nullable: true })
    comment!: string | null;

    @Column({ type: 'varchar', default: 'manual' })
    source!: ContactSource;
}
