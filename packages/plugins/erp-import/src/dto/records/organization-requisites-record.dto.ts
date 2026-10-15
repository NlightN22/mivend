import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Must stay in sync with OrganizationRequisitesRecord in @mivend/plugin-documents/src/types.ts.
// ERP is master: fields are never admin-entered. Logo is set only via setOrganizationLogo.
export class OrganizationRequisitesRecordDto {
    @ApiProperty({
        description:
            'ERP identifier, used as the idempotency key. One active row expected per legal entity.',
    })
    erpId!: string;

    @ApiProperty()
    legalName!: string;

    @ApiProperty({ description: 'Tax ID.' })
    inn!: string;

    @ApiPropertyOptional({ type: String, nullable: true })
    kpp?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    ogrn?: string | null;

    @ApiProperty()
    legalAddress!: string;

    @ApiPropertyOptional({ type: String, nullable: true })
    bankName?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    bankAccount?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    bankBik?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    correspondentAccount?: string | null;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description:
            'Name of the person authorized to sign documents on behalf of the organization.',
    })
    signatoryName?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true, description: "Signatory's job title." })
    signatoryTitle?: string | null;
}
