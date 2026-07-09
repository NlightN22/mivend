import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors EmployeeRecordInput in @mivend/plugin-access-control. Binds org-structure data
// onto an existing Administrator, matched by email — never creates the Administrator account
// itself (see EmployeeService for the reasoning).
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
            'Physical branch/point code — operational visibility, independent of departmentId.',
    })
    branchId?: string | null;

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
        description: 'Job title/position, display-only — not used for authorization.',
    })
    position?: string | null;
}
