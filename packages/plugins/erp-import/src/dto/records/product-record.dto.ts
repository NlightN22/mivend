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

    @ApiPropertyOptional({
        description:
            'Required order-quantity step (pack size) — omit entirely for products with no ' +
            'package constraint (most SKUs). Only send this when the 1C item has a default ' +
            'sales unit of measure set to a package ("Ед. изм. для продажи по умолчанию" = ' +
            'упаковка) — send the RESOLVED package coefficient as a single number (e.g. 20 for ' +
            'a 20-pack), not the two raw 1C fields (default sales UoM + package coefficient) ' +
            'separately. Unset/0/negative on our side = no constraint (treated as a data error, ' +
            'not enforced); 1 = no constraint; >1 = required step. See docs/order-flow.md ' +
            '"Pack-size / MOQ".',
    })
    multiplicity?: number;

    @ApiPropertyOptional({
        description:
            'Which of our own legal entities (OrganizationRequisites.id) owns the stock this ' +
            'product is fulfilled from — driven by 1C warehouse storage-location assignment. ' +
            'Not yet sourced from a real 1C export.',
    })
    organizationId?: number;
}
