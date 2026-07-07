import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors TradingPointRecord in ../../types.ts.
export class TradingPointRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty({ description: 'Must match an already-imported Counterparty erpId.' })
    counterpartyErpId!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    address!: string;

    @ApiPropertyOptional({ type: Number, nullable: true })
    latitude?: number | null;

    @ApiPropertyOptional({ type: Number, nullable: true })
    longitude?: number | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    workingHours?: string | null;

    @ApiProperty()
    isActive!: boolean;

    @ApiPropertyOptional({ type: String, nullable: true })
    contactName?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    contactPhone?: string | null;
}
