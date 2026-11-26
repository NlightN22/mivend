import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { randomUUID } from 'node:crypto';
import { ctxQuery, withAggregateLock } from 'shared';

import { loggerCtx } from '../types';
import { CounterpartyService } from '../counterparty.service';
import { Contract } from '../entities/contract.entity';
import { ContractFile } from '../entities/contract-file.entity';
import { MAX_CONTRACT_FILE_BYTES } from './contract-file.constants';
import { detectMime } from './contract-file-signature';
import { CONTRACT_FILE_KINDS, SCAN_KIND, type ContractFileKind } from './contract-file-sql';
import { ContractFileStorageService } from './contract-file-storage.service';

export interface UploadedFile {
    filename?: string;
    mimetype?: string;
    createReadStream?: () => AsyncIterable<Buffer | string>;
}

export interface ContractFileUploadInput {
    contractId: string;
    kind: string;
    file: Promise<UploadedFile>;
}

function assertKind(kind: string): asserts kind is ContractFileKind {
    if (!(CONTRACT_FILE_KINDS as readonly string[]).includes(kind)) {
        throw new UserInputError(`Unknown contract file kind: ${kind}`);
    }
}

async function readBounded(file: UploadedFile): Promise<Buffer> {
    if (!file.createReadStream) throw new UserInputError('No file received');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of file.createReadStream()) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += part.length;
        if (size > MAX_CONTRACT_FILE_BYTES) throw new UserInputError('The file is too large');
        chunks.push(part);
    }
    if (size === 0) throw new UserInputError('The file is empty');
    return Buffer.concat(chunks);
}

@Injectable()
export class ContractFileService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
        private readonly storage: ContractFileStorageService,
    ) {}

    // Not found and not visible answer the same, so a hidden contract is not revealed.
    async findWritableContract(ctx: RequestContext, contractId: string): Promise<Contract> {
        const contract = await this.connection
            .getRepository(ctx, Contract)
            .findOne({ where: { id: Number(contractId) } });
        const visible =
            contract && (await this.counterparties.findOneVisible(ctx, contract.counterpartyId));
        if (!contract || !visible) throw new UserInputError('Contract not found');
        return contract;
    }

    // The file is written first under its new uuid, nothing refers to it until the row commits;
    // a failed commit removes it, and the replaced scan's file is removed only after the commit.
    async upload(ctx: RequestContext, input: ContractFileUploadInput): Promise<ContractFile> {
        assertKind(input.kind);
        const contract = await this.findWritableContract(ctx, input.contractId);
        const upload = await input.file;
        const data = await readBounded(upload);
        const mimeType = detectMime(data);
        if (!mimeType) throw new UserInputError('Only PDF, PNG and JPEG files are accepted');
        const uuid = randomUUID();
        await this.storage.write(uuid, data);
        let replaced: ContractFile[] = [];
        let saved: ContractFile;
        try {
            const administratorId = await this.administratorId(ctx);
            ({ saved, replaced } = await withAggregateLock(
                this.connection,
                ctx,
                `contract-file:${contract.id}`,
                async tx => {
                    const repo = this.connection.getRepository(tx, ContractFile);
                    const old =
                        input.kind === SCAN_KIND
                            ? await repo.find({
                                  where: { contractId: Number(contract.id), kind: SCAN_KIND },
                                  take: 50,
                              })
                            : [];
                    const row = await repo.save(
                        repo.create({
                            uuid,
                            contractId: Number(contract.id),
                            kind: input.kind,
                            fileName: upload.filename || uuid,
                            mimeType,
                            sizeBytes: data.length,
                            uploadedByAdministratorId: administratorId,
                        }),
                    );
                    if (old.length) await repo.remove(old);
                    return { saved: row, replaced: old };
                },
            ));
        } catch (e) {
            await this.removeFile(uuid);
            throw e;
        }
        for (const old of replaced) await this.removeFile(old.uuid);
        return saved;
    }

    async remove(ctx: RequestContext, uuid: string): Promise<boolean> {
        const file = await this.connection
            .getRepository(ctx, ContractFile)
            .findOne({ where: { uuid } });
        if (!file) return false;
        await this.findWritableContract(ctx, String(file.contractId));
        const removed = await withAggregateLock(
            this.connection,
            ctx,
            `contract-file:${file.contractId}`,
            async tx => {
                const repo = this.connection.getRepository(tx, ContractFile);
                const current = await repo.findOne({ where: { uuid } });
                if (!current) return false;
                await repo.remove(current);
                return true;
            },
        );
        if (removed) await this.removeFile(uuid);
        return removed;
    }

    // A file left behind is only disk garbage, so a failed removal is logged, not raised.
    private async removeFile(uuid: string): Promise<void> {
        try {
            await this.storage.remove(uuid);
        } catch (e) {
            Logger.error(`Could not remove contract file ${uuid}: ${String(e)}`, loggerCtx);
        }
    }

    private async administratorId(ctx: RequestContext): Promise<string | null> {
        if (!ctx.activeUserId) return null;
        const rows = await ctxQuery<Array<{ id: number }>>(
            this.connection,
            ctx,
            'SELECT id FROM administrator WHERE "userId" = $1 LIMIT 1',
            [ctx.activeUserId],
        );
        return rows[0] ? String(rows[0].id) : null;
    }
}
