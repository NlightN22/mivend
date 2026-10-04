import { ApiProperty } from '@nestjs/swagger';

export class WarehouseRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ description: 'ERP identifier of the owning branch.' })
    branchErpId!: string;

    @ApiProperty()
    isActive!: boolean;

    @ApiProperty({
        required: false,
        description:
            'Name of an existing unbound StockLocation to adopt as this warehouse stock location ' +
            '(keeps stock already held there). Absent: a new StockLocation is created.',
    })
    stockLocationName?: string;
}
