import { ApiProperty } from '@nestjs/swagger';

// Mirrors StorageLocationRecord in ../../types.ts.
export class StorageLocationRecordDto {
    @ApiProperty({ description: 'ERP row id, used as the idempotency key.' })
    entityId!: string;

    @ApiProperty({ description: 'ERP identifier of the product.' })
    productErpId!: string;

    @ApiProperty({ description: 'ERP identifier of the organization that stores the product.' })
    organizationErpId!: string;

    @ApiProperty({ description: 'ERP identifier of the warehouse of the storage place.' })
    warehouseErpId!: string;

    @ApiProperty({ required: false, description: 'Lowest priority wins; defaults to 0.' })
    priority?: number;
}
