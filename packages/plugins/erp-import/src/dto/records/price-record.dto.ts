import { ApiProperty } from '@nestjs/swagger';

// Mirrors PriceRecord in ../../types.ts.
export class PriceRecordDto {
    @ApiProperty({ description: 'Must match an already-imported Product/ProductVariant SKU.' })
    sku!: string;

    @ApiProperty({
        description:
            'Code of an existing price type (e.g. RETAIL, WHOLESALE) — loaded from the database, never hardcoded.',
    })
    priceTypeCode!: string;

    @ApiProperty({
        description:
            'Decimal amount (e.g. rubles) — converted to the smallest currency unit internally.',
    })
    price!: number;
}
