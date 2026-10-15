import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import { KafkaStatusDto } from './dto/kafka-status.dto';
import { KafkaStatusApiKeyGuard } from './kafka-status-api-key.guard';
import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';

// The consumer runs in the worker process, not here, so isConnected() would always report false;
// the persisted status row is the only shared state. No row yet means connected: false.
@ApiTags('ERP Callback')
@ApiSecurity('erp-callback-api-key')
@UseGuards(KafkaStatusApiKeyGuard)
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
