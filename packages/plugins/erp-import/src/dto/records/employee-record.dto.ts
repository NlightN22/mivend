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
            'erpId of the branch/point this employee works at (see Branch) — resolved to a ' +
            'mivend Branch.id before being stored, same as WarehouseChanged.branchId. ' +
            'Operational visibility, independent of departmentId.',
    })
    branchErpId?: string | null;

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
