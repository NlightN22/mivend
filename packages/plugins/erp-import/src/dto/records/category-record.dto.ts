import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors CategoryRecord in ../../types.ts.
export class CategoryRecordDto {
    @ApiProperty({ description: 'ERP identifier, used as the idempotency key.' })
    erpId!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({
        nullable: true,
        type: String,
        description: 'erpId of the parent category, or null for a top-level category.',
    })
    parentErpId!: string | null;

    @ApiPropertyOptional({
        nullable: true,
        type: String,
        description:
            'File name of the category icon inside the configured import assets directory.',
    })
    iconFile?: string | null;
}
