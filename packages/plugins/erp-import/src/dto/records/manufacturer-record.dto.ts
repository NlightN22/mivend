import { ApiProperty } from '@nestjs/swagger';

export class ManufacturerRecordDto {
    @ApiProperty({ description: 'Manufacturer code, the idempotency key.' })
    code!: string;

    @ApiProperty()
    name!: string;
}
