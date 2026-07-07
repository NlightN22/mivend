import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors CounterpartyRecord in ../../types.ts.
export class CounterpartyRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    legalName!: string;

    @ApiProperty()
    shortName!: string;

    @ApiPropertyOptional({ type: String, nullable: true, description: 'Tax ID.' })
    inn?: string | null;

    @ApiProperty({
        description: 'Decimal amount — converted to the smallest currency unit internally.',
    })
    creditLimit!: number;

    @ApiProperty({
        description: 'Decimal amount — converted to the smallest currency unit internally.',
    })
    creditBalance!: number;

    @ApiProperty()
    paymentDelayDays!: number;

    @ApiProperty({
        description: 'Code of an existing price type this counterparty is assigned to.',
    })
    priceType!: string;

    @ApiProperty()
    isActive!: boolean;
}
