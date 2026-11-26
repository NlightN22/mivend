import { Injectable } from '@nestjs/common';
import {
    Asset,
    AssetService,
    isGraphQlErrorResult,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { ctxQuery, withAggregateLock } from 'shared';

import { CounterpartyService } from '../counterparty.service';
import { Contract } from '../entities/contract.entity';
import { ContractFile } from '../entities/contract-file.entity';
import { CONTRACT_FILE_KINDS, SCAN_KIND, type ContractFileKind } from './contract-file-sql';

export interface ContractFileUploadInput {
    contractId: string;
    kind: string;
    file: Promise<UploadedFile>;
}

export interface UploadedFile {
    filename?: string;
}

function assertKind(kind: string): asserts kind is ContractFileKind {
    if (!(CONTRACT_FILE_KINDS as readonly string[]).includes(kind)) {
        throw new UserInputError(`Unknown contract file kind: ${kind}`);
    }
}

@Injectable()
export class ContractFileService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
        private readonly assets: AssetService,
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

    // One scan per contract: a new scan replaces the previous one under the contract lock.
    async upload(ctx: RequestContext, input: ContractFileUploadInput): Promise<ContractFile> {
        assertKind(input.kind);
        const contract = await this.findWritableContract(ctx, input.contractId);
        return withAggregateLock(this.connection, ctx, `contract-file:${contract.id}`, async tx => {
            const uuid = randomUUID();
            const upload = await input.file;
            const asset = await this.createAsset(tx, {
                ...upload,
                filename: `${uuid}${extname(upload.filename ?? '')}`,
            });
            const repo = this.connection.getRepository(tx, ContractFile);
            const replaced =
                input.kind === SCAN_KIND
                    ? await repo.find({
                          where: { contractId: Number(contract.id), kind: SCAN_KIND },
                          take: 50,
                      })
                    : [];
            const saved = await repo.save(
                repo.create({
                    uuid,
                    contractId: Number(contract.id),
                    kind: input.kind,
                    assetId: Number(asset.id),
                    fileName: upload.filename ?? asset.name,
                    uploadedByAdministratorId: await this.administratorId(tx),
                }),
            );
            if (replaced.length) {
                await repo.remove(replaced);
                await this.assets.delete(
                    tx,
                    replaced.map(f => f.assetId),
                    true,
                );
            }
            return saved;
        });
    }

    async remove(ctx: RequestContext, uuid: string): Promise<boolean> {
        const file = await this.connection
            .getRepository(ctx, ContractFile)
            .findOne({ where: { uuid } });
        if (!file) return false;
        const contract = await this.connection
            .getRepository(ctx, Contract)
            .findOne({ where: { id: file.contractId } });
        if (!contract) return false;
        await this.findWritableContract(ctx, String(contract.id));
        await withAggregateLock(this.connection, ctx, `contract-file:${contract.id}`, async tx => {
            const repo = this.connection.getRepository(tx, ContractFile);
            const current = await repo.findOne({ where: { uuid } });
            if (!current) return;
            await repo.remove(current);
            await this.assets.delete(tx, [current.assetId], true);
        });
        return true;
    }

    // The stored name is the file uuid, so the public asset URL cannot be guessed from the file name.
    private async createAsset(ctx: RequestContext, file: unknown): Promise<Asset> {
        const result = await this.assets.create(ctx, { file: Promise.resolve(file) });
        if (isGraphQlErrorResult(result)) throw new UserInputError(result.message);
        return result;
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
