import { ApiProperty } from '@nestjs/swagger';

// Mirrors StockOrganizationRecord in ../../types.ts.
export class StockOrganizationRecordDto {
    @ApiProperty({
        description:
            'ERP row id, used as the idempotency key together with product and organization.',
    })
    entityId!: string;

    @ApiProperty({ description: 'ERP identifier of the product.' })
    productErpId!: string;

    @ApiProperty({ description: 'ERP identifier of the organization holding the stock.' })
    organizationErpId!: string;

    @ApiProperty({
        description: 'Quantity in the product storage unit; negative balances are allowed.',
    })
    quantity!: number;

    @ApiProperty({ required: false, description: 'Defaults to true.' })
    isActive?: boolean;
}
