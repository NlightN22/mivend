import { ApiProperty } from '@nestjs/swagger';

export class ErpStatusUpdateDto {
    @ApiProperty({
        description:
            'Vendure order code (the cross-reference key) — always known at order creation.',
        example: 'ORD-202607-28607FEA',
    })
    orderCode!: string;

    @ApiProperty({
        description: 'A status code of the order status dictionary; an unknown code is ignored.',
    })
    status!: string;

    @ApiProperty({
        required: false,
        nullable: true,
        description:
            'ERP document code, optional — never used as a lookup key, stored for reference only.',
        example: 'DOC-0012345',
    })
    erpOrderId?: string;
}
