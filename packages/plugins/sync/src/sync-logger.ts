import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SyncLogger {
    private readonly logger = new Logger('plugin-sync');

    info(msg: string): void {
        this.logger.log(msg);
    }

    warn(msg: string): void {
        this.logger.warn(msg);
    }

    error(msg: string, err?: unknown): void {
        this.logger.error(msg, err instanceof Error ? err.stack : String(err ?? ''));
    }

    dlq(eventId: string, reason: string): void {
        this.logger.error(`[DLQ] eventId=${eventId} reason=${reason}`);
    }
}
