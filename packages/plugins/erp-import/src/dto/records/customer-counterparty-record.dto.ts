import { ApiProperty } from '@nestjs/swagger';

// Mirrors CustomerCounterpartyRecord in ../../types.ts. Links an
// already-imported customer to an already-imported counterparty.
export class CustomerCounterpartyRecordDto {
    @ApiProperty()
    customerEmail!: string;

    @ApiProperty()
    counterpartyErpId!: string;
}
