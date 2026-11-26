import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// The file itself lives in ContractFileStorageService under this row's uuid.
@Entity()
export class ContractFile extends VendureEntity {
    constructor(input?: DeepPartial<ContractFile>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'uuid' })
    uuid!: string;

    @Index()
    @Column({ type: 'int' })
    contractId!: number;

    @Column({ type: 'varchar' })
    kind!: string;

    @Column({ type: 'varchar' })
    fileName!: string;

    @Column({ type: 'varchar' })
    mimeType!: string;

    @Column({ type: 'int' })
    sizeBytes!: number;

    @Column({ type: 'varchar', nullable: true })
    uploadedByAdministratorId!: string | null;
}
