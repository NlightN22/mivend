import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ERP_ORDER_STATUSES } from '@mivend/plugin-erp-order';

export class OrderErpStatusDto {
    @ApiProperty({ example: 'ORD-202607-28607FEA' })
    orderCode!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        enum: ERP_ORDER_STATUSES,
        description: 'null if no status has ever been reported for this order.',
    })
    status!: string | null;

    @ApiPropertyOptional({ type: String, nullable: true })
    erpOrderId!: string | null;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'ISO 8601 datetime of the last status update, or null.',
    })
    updatedAt!: string | null;
}
