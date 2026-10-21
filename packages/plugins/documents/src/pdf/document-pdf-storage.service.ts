import { Inject, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';

import { DOCUMENTS_PLUGIN_OPTIONS } from '../constants';
import type { ResolvedDocumentsPluginOptions } from '../types';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Private directory, never served by AssetServerPlugin: downloads go through DocumentPdfController.
@Injectable()
export class DocumentPdfStorageService {
    constructor(
        @Inject(DOCUMENTS_PLUGIN_OPTIONS) private options: ResolvedDocumentsPluginOptions,
    ) {}

    async write(uuid: string, pdf: Buffer): Promise<void> {
        const target = this.filePath(uuid);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmp, pdf);
        await fs.rename(tmp, target);
    }

    async read(uuid: string): Promise<Buffer | null> {
        try {
            return await fs.readFile(this.filePath(uuid));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw e;
        }
    }

    async remove(uuid: string): Promise<void> {
        await fs.rm(this.filePath(uuid), { force: true });
    }

    private filePath(uuid: string): string {
        if (!UUID_RE.test(uuid)) throw new Error(`Invalid document uuid: ${uuid}`);
        return path.join(this.options.pdfDir, `${uuid.toLowerCase()}.pdf`);
    }
}
