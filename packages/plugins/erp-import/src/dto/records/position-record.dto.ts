import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors PositionRecordInput in @mivend/plugin-access-control.
export class PositionRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    name!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'erpId of the parent position, or null/omitted for a top-level position.',
    })
    parentErpId?: string | null;

    @ApiPropertyOptional({ description: 'Defaults to true when omitted.' })
    isActive?: boolean;
}
