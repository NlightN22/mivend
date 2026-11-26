import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { ContractFileReadService } from './contract-file-read.service';

interface FileResponse {
    set(headers: Record<string, string>): unknown;
    send(body: Buffer): unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('contract-file')
export class ContractFileController {
    constructor(private readonly reads: ContractFileReadService) {}

    // Public at the guard: every refusal (guest, hidden, missing) is the same 404.
    @Get(':uuid')
    @Allow(Permission.Public)
    async download(
        @Ctx() ctx: RequestContext,
        @Param('uuid') uuid: string,
        @Res() res: FileResponse,
    ): Promise<void> {
        const file = UUID_RE.test(uuid)
            ? await this.reads.readForDownload(ctx, uuid.toLowerCase())
            : null;
        if (!file) throw new NotFoundException();
        res.set({
            'Content-Type': file.mimeType,
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        res.send(file.data);
    }
}
