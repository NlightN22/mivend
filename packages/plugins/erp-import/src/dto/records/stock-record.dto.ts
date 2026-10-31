import { ApiProperty } from '@nestjs/swagger';

// Mirrors StockRecord in ../../types.ts.
export class StockRecordDto {
    @ApiProperty()
    sku!: string;

    @ApiProperty()
    stockOnHand!: number;

    @ApiProperty({
        required: false,
        description:
            'ERP identifier of the warehouse holding this quantity. Absent: the quantity is written ' +
            'to every existing stock level of the variant.',
    })
    warehouseErpId?: string;
}
