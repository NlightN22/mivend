import { ApiProperty } from '@nestjs/swagger';

export class KafkaStatusDto {
    @ApiProperty({
        description: 'Whether the Integration Service Kafka consumer is currently connected.',
        example: true,
    })
    connected!: boolean;
}
