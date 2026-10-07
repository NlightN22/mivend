import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors ContractRecord in ../../types.ts.
export class ContractRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty({ description: 'erpId of an already imported counterparty.' })
    counterpartyErpId!: string;

    @ApiPropertyOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'Defaults to an empty string when omitted.' })
    organizationId?: string;

    @ApiProperty()
    priceTypeId!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'Decimal amount as a string, same shape as the contract stream.',
    })
    creditLimit?: string | null;

    @ApiPropertyOptional({ type: Number, nullable: true })
    debtDaysLimit?: number | null;

    @ApiProperty()
    isActive!: boolean;

    @ApiPropertyOptional({ description: 'Excludes the limit from the shared pool when true.' })
    controlledIndividually?: boolean;
}
