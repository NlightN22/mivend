import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors CounterpartyDiscountRuleRecord in ../../types.ts; keep the fields in sync with it.
// Dev/test seeding of the rules production receives from the discount-rule stream.
export class CounterpartyDiscountRuleRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty({ description: 'erpId of the counterparty the rule is addressed to.' })
    counterpartyErpId!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'Product externalId; all products when empty.',
    })
    productErpId?: string | null;

    @ApiProperty({ enum: ['byQuantity', 'byDocumentAmount'] })
    condition!: 'byQuantity' | 'byDocumentAmount';

    @ApiProperty({ description: 'Threshold; 0 means applicable from the first unit.' })
    conditionValue!: number;

    @ApiProperty({ description: 'Discount percent; a negative value is a markup.' })
    percent!: number;

    @ApiProperty({ description: 'ISO 8601 datetime.' })
    validFrom!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'ISO 8601 datetime; open-ended when empty.',
    })
    validTo?: string | null;
}
