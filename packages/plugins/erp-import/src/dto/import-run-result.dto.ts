import { ApiProperty } from '@nestjs/swagger';

export class ImportRunErrorDto {
    @ApiProperty({ description: 'Index of the failing record within the submitted batch' })
    index!: number;

    @ApiProperty()
    message!: string;
}

export class ImportRunResultDto {
    @ApiProperty()
    runId!: string;

    @ApiProperty()
    exchangeId!: string;

    @ApiProperty({ enum: ['pending', 'processing', 'done', 'failed'] })
    status!: string;

    @ApiProperty({ description: 'Total number of records in the batch' })
    total!: number;

    @ApiProperty({ description: 'Number of records successfully processed' })
    processed!: number;

    @ApiProperty({ description: 'Number of records that failed' })
    failed!: number;

    @ApiProperty({ type: [ImportRunErrorDto] })
    errors!: ImportRunErrorDto[];

    @ApiProperty()
    createdAt!: string;

    @ApiProperty({ type: String, nullable: true })
    finishedAt!: string | null;
}
