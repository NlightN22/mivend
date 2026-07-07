import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors ProductRecord in ../../types.ts — kept in sync by hand, see
// AGENTS.md's "REST endpoint documentation" section for why this isn't
// auto-derived from the internal interface.
export class ProductRecordDto {
    @ApiProperty({ description: 'ERP identifier for this product, used as the idempotency key.' })
    externalId!: string;

    @ApiProperty()
    sku!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    slug!: string;

    @ApiPropertyOptional()
    description?: string;

    @ApiPropertyOptional()
    fullName?: string;

    @ApiProperty({
        description:
            'Decimal amount (e.g. rubles) — converted to the smallest currency unit internally.',
    })
    price!: number;

    @ApiProperty()
    stockOnHand!: number;

    @ApiPropertyOptional({
        description: 'Code of an existing Category record to assign this product to.',
    })
    categoryCode?: string;

    @ApiPropertyOptional({ description: 'Brand facet value code.' })
    brandCode?: string;

    @ApiPropertyOptional()
    onSale?: boolean;

    @ApiPropertyOptional({ description: 'Defaults to true when omitted.' })
    enabled?: boolean;

    @ApiPropertyOptional({ description: 'Kilograms — used by weight-tiered discount rules.' })
    weight?: number;
}
