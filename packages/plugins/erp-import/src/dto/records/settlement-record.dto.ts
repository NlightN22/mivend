import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors ../../settlement-types.ts. Amounts are major units; versions are newer-wins per key.
export class SettlementEntryRecordDto {
    @ApiProperty()
    organizationErpId!: string;

    @ApiProperty()
    counterpartyErpId!: string;

    @ApiProperty()
    contractErpId!: string;

    @ApiProperty({ example: 'RUB' })
    currency!: string;

    @ApiProperty({ description: 'Positive raises the debt, negative settles it.' })
    amount!: number;

    @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO 8601 datetime.' })
    dueDate?: string | null;
}

export class SettlementDocumentRecordDto {
    @ApiProperty({ description: 'ERP document uuid, the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    version!: string;

    @ApiProperty()
    documentType!: string;

    @ApiProperty()
    documentTypeLabel!: string;

    @ApiProperty()
    number!: string;

    @ApiProperty({ description: 'ISO 8601 datetime.' })
    date!: string;

    @ApiPropertyOptional()
    isDeleted?: boolean;

    @ApiProperty({ type: [SettlementEntryRecordDto] })
    entries!: SettlementEntryRecordDto[];
}

export class SettlementBalanceRecordDto {
    @ApiProperty({ description: 'Balance key, the idempotency key.' })
    key!: string;

    @ApiProperty()
    version!: string;

    @ApiProperty()
    organizationErpId!: string;

    @ApiProperty()
    counterpartyErpId!: string;

    @ApiProperty()
    contractErpId!: string;

    @ApiProperty({ example: 'RUB' })
    currency!: string;

    @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO 8601 datetime.' })
    openingDate?: string | null;

    @ApiProperty()
    openingBalance!: number;

    @ApiProperty()
    closingBalance!: number;

    @ApiPropertyOptional()
    isDeleted?: boolean;
}

export class SettlementDocumentTypeRecordDto {
    @ApiProperty()
    documentType!: string;

    @ApiProperty()
    version!: string;

    @ApiProperty()
    label!: string;

    @ApiProperty({ example: 'sale' })
    category!: string;

    @ApiProperty()
    customerVisible!: boolean;

    @ApiPropertyOptional({ type: Number, nullable: true })
    sortOrder?: number | null;

    @ApiPropertyOptional()
    isDeleted?: boolean;
}
