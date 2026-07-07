import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['erpId'], { unique: true })
export class OrganizationRequisites extends VendureEntity {
    constructor(input?: DeepPartial<OrganizationRequisites>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    legalName!: string;

    @Column({ type: 'varchar' })
    inn!: string;

    @Column({ type: 'varchar', nullable: true })
    kpp!: string | null;

    @Column({ type: 'varchar', nullable: true })
    ogrn!: string | null;

    @Column({ type: 'varchar' })
    legalAddress!: string;

    @Column({ type: 'varchar', nullable: true })
    bankName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    bankAccount!: string | null;

    @Column({ type: 'varchar', nullable: true })
    bankBik!: string | null;

    @Column({ type: 'varchar', nullable: true })
    correspondentAccount!: string | null;

    @Column({ type: 'varchar', nullable: true })
    signatoryName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    signatoryTitle!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // Set via the Admin API (setOrganizationLogo), never via ERP push — a logo
    // is a design/branding asset, not transactional ERP data. Deliberately not
    // part of the ERP-pushed record shape so a routine requisites upsert from
    // 1C can never clobber it.
    @Column({ type: 'varchar', nullable: true })
    logoAssetId!: string | null;
}
