import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors DepartmentRecordInput in @mivend/plugin-access-control.
export class DepartmentRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    name!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'erpId of the parent department, or null/omitted for a top-level department.',
    })
    parentErpId?: string | null;
}
