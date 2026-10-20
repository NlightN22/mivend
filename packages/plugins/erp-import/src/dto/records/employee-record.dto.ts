import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Must stay in sync with EmployeeRecordInput in @mivend/plugin-access-control.
// Only binds to an existing Administrator matched by email; never creates one (see EmployeeService).
export class EmployeeRecordDto {
    @ApiProperty({
        description: 'ERP identifier for this employee record, used as the idempotency key.',
    })
    erpId!: string;

    @ApiProperty({ description: 'Matched against an existing Administrator.emailAddress.' })
    email!: string;

    @ApiProperty({ description: 'erpId of an existing Department record.' })
    departmentErpId!: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description:
            'Code of an existing Vendure Role to assign to this Administrator, if provided.',
    })
    roleCode?: string | null;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'erpId of the ErpPosition, display-only — not used for authorization.',
    })
    positionErpId?: string | null;
}
