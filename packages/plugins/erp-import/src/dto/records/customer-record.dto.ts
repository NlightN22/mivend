import { ApiProperty } from '@nestjs/swagger';

// Mirrors CustomerRecord in ../../types.ts.
export class CustomerRecordDto {
    @ApiProperty()
    email!: string;

    @ApiProperty()
    firstName!: string;

    @ApiProperty()
    lastName!: string;

    @ApiProperty({ description: 'Plaintext — hashed on import, never stored or logged as-is.' })
    password!: string;
}
