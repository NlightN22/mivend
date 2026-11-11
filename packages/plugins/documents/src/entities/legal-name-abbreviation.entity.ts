import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Staff-edited legal-form shortening applied only to the payment QR recipient name.
@Entity('documents_legal_name_abbreviation')
export class LegalNameAbbreviation extends VendureEntity {
    constructor(input?: DeepPartial<LegalNameAbbreviation>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'uuid' })
    uuid!: string;

    @Column({ type: 'varchar' })
    phrase!: string;

    @Column({ type: 'varchar' })
    abbreviation!: string;

    // Lower-cased, single-spaced phrase: carries the case-insensitive uniqueness.
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    phraseKey!: string;
}
