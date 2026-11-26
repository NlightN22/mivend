import { Inject, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';

import { CONTRACT_FILE_OPTIONS } from './contract-file.constants';
import type { ResolvedContractFileOptions } from './contract-file.constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Private directory, never served by AssetServerPlugin: files leave only through ContractFileController.
@Injectable()
export class ContractFileStorageService {
    constructor(@Inject(CONTRACT_FILE_OPTIONS) private options: ResolvedContractFileOptions) {}

    async write(uuid: string, data: Buffer): Promise<void> {
        const target = this.filePath(uuid);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmp, data);
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
        if (!UUID_RE.test(uuid)) throw new Error(`Invalid contract file uuid: ${uuid}`);
        return path.join(this.options.dir, uuid.toLowerCase());
    }
}
