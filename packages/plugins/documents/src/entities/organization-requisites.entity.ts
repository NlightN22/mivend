import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export interface OrganizationSignatory {
    role: string;
    roleLabel: string;
    personName: string;
    position: string | null;
}

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

    // Nullable: a row may be created before its requisites arrive; never fabricate a placeholder.
    @Column({ type: 'varchar', nullable: true })
    inn!: string | null;

    @Column({ type: 'varchar', nullable: true })
    kpp!: string | null;

    @Column({ type: 'varchar', nullable: true })
    ogrn!: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalAddress!: string | null;

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

    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;

    // Latest ERP signatory list; role is the ERP enum name (e.g. head, chief accountant).
    @Column({ type: 'simple-json', nullable: true })
    signatories!: OrganizationSignatory[] | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // Set via the Admin API (setOrganizationLogo), never via ERP push — a logo
    // is a design/branding asset, not transactional ERP data. Deliberately not
    // part of the ERP-pushed record shape so a routine requisites upsert from
    // ERP can never clobber it.
    @Column({ type: 'varchar', nullable: true })
    logoAssetId!: string | null;
}

// Narrowed type document generation needs — DocumentsService.assertRequisitesComplete proves the
// required fields (see requisites-completeness.ts) are non-null; address, kpp, phone are optional.
export type CompleteOrganizationRequisites = OrganizationRequisites & {
    inn: string;
    bankName: string;
    bankBik: string;
    bankAccount: string;
};
