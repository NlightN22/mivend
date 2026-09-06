import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import { KafkaStatusDto } from './dto/kafka-status.dto';
import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';

// Reads the status row KafkaConsumerService persists on CONNECT/DISCONNECT/CRASH — this
// controller is served by the main HTTP process, while the Kafka consumer only ever runs in the
// worker process (separate Node processes, no shared memory), so reading isConnected() directly
// would always report this process's own, permanently-unconnected instance. See
// kafka-consumer-status.entity.ts's own doc comment. No row yet (consumer never started) reads
// as connected: false — the same safe default as "not connected".
@ApiTags('ERP Callback')
@Controller('erp')
export class KafkaStatusController {
    constructor(private readonly dataSource: DataSource) {}

    @Get('kafka-status')
    @ApiOperation({
        summary: 'Current connection state of the Integration Service Kafka consumer',
    })
    @ApiResponse({ status: 200, type: KafkaStatusDto })
    async getStatus(): Promise<KafkaStatusDto> {
        const row = await this.dataSource
            .getRepository(KafkaConsumerStatus)
            .findOne({ where: { key: 'default' } });
        return { connected: row?.connected ?? false };
    }
}
