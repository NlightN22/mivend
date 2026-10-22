import { ApiProperty } from '@nestjs/swagger';
import type { PriceTypeVisibility } from '@mivend/plugin-customer-pricing';

// Mirrors PriceTypeRecord in ../../types.ts.
export class PriceTypeRecordDto {
    @ApiProperty({ description: 'Price type code, the idempotency key.' })
    code!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({
        enum: ['customer', 'confidential'],
        description:
            'customer: may be shown to staff by branch; confidential: never shown outside its permission.',
    })
    visibility!: PriceTypeVisibility;

    @ApiProperty({
        required: false,
        description: 'Marks the single purchase type; any other purchase type loses the flag.',
    })
    isPurchase?: boolean;

    @ApiProperty({
        required: false,
        description: 'Purchase type only: floor price = purchase price x this multiplier.',
    })
    ceilingMultiplier?: number;
}
