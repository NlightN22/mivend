import { ApiProperty } from '@nestjs/swagger';

// Mirrors StockRecord in ../../types.ts.
export class StockRecordDto {
    @ApiProperty()
    sku!: string;

    @ApiProperty()
    stockOnHand!: number;
}
