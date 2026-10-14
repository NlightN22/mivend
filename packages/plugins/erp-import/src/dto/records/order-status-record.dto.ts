import { ApiProperty } from '@nestjs/swagger';

// Mirrors OrderStatusReferenceInput in @mivend/plugin-erp-order (a synthetic local-contour reference).
export class OrderStatusRecordDto {
    @ApiProperty({ description: 'ERP status code, the idempotency key.' })
    code!: string;

    @ApiProperty()
    version!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ description: 'Forward-only order of the status; 0 is outside the line.' })
    rank!: number;

    @ApiProperty()
    terminal!: boolean;

    @ApiProperty()
    customerVisible!: boolean;

    @ApiProperty()
    description!: string;

    @ApiProperty({ description: 'Customer-facing order filter bucket.' })
    customerGroup!: string;

    @ApiProperty({ description: 'A warehouse order exists; cancellation is refused from here.' })
    warehouseStarted!: boolean;

    @ApiProperty({ description: 'Goods left the warehouse (a sales document is posted).' })
    shipped!: boolean;

    @ApiProperty()
    delivered!: boolean;

    @ApiProperty({ description: 'The order is cancelled; never leaves this status.' })
    cancelled!: boolean;
}
