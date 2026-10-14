import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderErpStatusDto {
    @ApiProperty({ example: 'ORD-202607-28607FEA' })
    orderCode!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description:
            'A status code of the order status dictionary; null if none was ever reported.',
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
