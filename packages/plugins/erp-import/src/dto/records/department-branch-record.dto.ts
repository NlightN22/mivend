import { ApiProperty } from '@nestjs/swagger';

// Dev seed only: real contours map departments to branches through the manager portal.
export class DepartmentBranchRecordDto {
    @ApiProperty({ description: 'erpId of an existing Department record (the mapping root).' })
    departmentErpId!: string;

    @ApiProperty({ description: 'erpId of an existing Branch record.' })
    branchErpId!: string;
}
