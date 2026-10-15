import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors DiscountRuleRecord in ../../types.ts; keep the fields in sync with it.
// ERP import seeding is dev/test only; production rules come from the Admin API.
export class DiscountRuleRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty({ description: 'Code of an existing price type this rule applies to.' })
    priceTypeCode!: string;

    @ApiProperty({ nullable: true, type: String })
    facetCode!: string | null;

    @ApiProperty({ nullable: true, type: String })
    facetValueCode!: string | null;

    @ApiProperty({ description: 'Discount percent, e.g. 10 for 10%.' })
    percent!: number;

    @ApiProperty({ description: 'ISO 8601 datetime.' })
    validFrom!: string;

    @ApiProperty({ description: 'ISO 8601 datetime.' })
    validTo!: string;

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: 'Weight threshold in kg for volume-tiered rules.',
    })
    minWeightKg?: number | null;

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description:
            'Decimal amount threshold (e.g. rubles) for spend-amount-tiered rules — ' +
            'converted to the smallest currency unit internally, same convention as PriceRecord.price.',
    })
    minAmount?: number | null;
}
