import { ApiProperty } from '@nestjs/swagger';
import { ERP_ORDER_STATUSES } from '@mivend/plugin-erp-order';

export class ErpStatusUpdateDto {
    @ApiProperty({
        description:
            'Vendure order code (the cross-reference key) — always known at order creation.',
        example: 'ORD-202607-28607FEA',
    })
    orderCode!: string;

    @ApiProperty({ enum: ERP_ORDER_STATUSES })
    status!: string;

    @ApiProperty({
        required: false,
        nullable: true,
        description:
            '1C document code, optional — never used as a lookup key, stored for reference only.',
        example: 'DOC-0012345',
    })
    erpOrderId?: string;
}
