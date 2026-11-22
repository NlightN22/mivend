import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Which e-mail address of a customer the customer has proved to own; written by raw SQL in the service.
@Entity()
export class EmailConfirmation extends UuidEntity {
    constructor(input?: DeepPartial<EmailConfirmation>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'int' })
    customerId!: number;

    @Column({ type: 'varchar', nullable: true })
    confirmedEmail!: string | null;

    @Column({ type: 'varchar', nullable: true })
    pendingEmail!: string | null;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    token!: string | null;
}
