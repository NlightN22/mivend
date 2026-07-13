import { ApiProperty } from '@nestjs/swagger';

// Mirrors BranchRecordInput in @mivend/plugin-access-control.
export class BranchRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    name!: string;
}
