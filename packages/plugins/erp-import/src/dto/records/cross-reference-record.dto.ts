import { ApiProperty } from '@nestjs/swagger';

class OemRefDto {
    @ApiProperty({ description: 'OEM part number' })
    oemCode!: string;

    @ApiProperty({ description: 'OEM brand/manufacturer name' })
    oemBrand!: string;
}

// Mirrors CrossReferenceRecord in ../../types.ts.
export class CrossReferenceRecordDto {
    @ApiProperty({
        description: 'externalId of an existing Product record (must be imported first).',
    })
    externalId!: string;

    @ApiProperty({ type: [OemRefDto] })
    refs!: OemRefDto[];
}
