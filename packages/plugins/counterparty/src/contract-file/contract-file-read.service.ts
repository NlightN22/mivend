import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { clampSkip, clampTake, ctxQuery, getPageAndCount, likeTerm } from 'shared';

import { CounterpartyService } from '../counterparty.service';
import { Contract } from '../entities/contract.entity';
import { ContractFile } from '../entities/contract-file.entity';
import { TradingPointService } from '../trading-point.service';
import { SCAN_KIND } from './contract-file-sql';
import { ContractFileStorageService } from './contract-file-storage.service';

export interface ContractFileRow {
    id: string;
    uuid: string;
    contractId: string;
    contractName: string | null;
    kind: string;
    fileName: string;
    uploadedBy: string | null;
    createdAt: Date;
}

export interface ContractListInput {
    search?: string | null;
    withoutScan?: boolean | null;
    skip?: number | null;
    take?: number | null;
}

export interface ContractRow {
    id: string;
    erpId: string;
    name: string | null;
    isActive: boolean;
    currency: string | null;
    hasScan: boolean;
    files: ContractFileRow[];
}

const FILE_SELECT = `SELECT f.id::text AS id, f.uuid::text AS uuid, f."contractId"::text AS "contractId",
    k.name AS "contractName", f.kind, f."fileName", f."createdAt",
    NULLIF(trim(concat(a."firstName", ' ', a."lastName")), '') AS "uploadedBy"
    FROM contract_file f JOIN contract k ON k.id = f."contractId"
    LEFT JOIN administrator a ON a.id::text = f."uploadedByAdministratorId"`;

@Injectable()
export class ContractFileReadService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
        private readonly tradingPoints: TradingPointService,
        private readonly storage: ContractFileStorageService,
    ) {}

    // Customer contracts of one visible counterparty, active first, with their files.
    async contractsOf(
        ctx: RequestContext,
        counterpartyId: string,
        input: ContractListInput = {},
    ): Promise<{ items: ContractRow[]; totalItems: number }> {
        if (!(await this.counterparties.findOneVisible(ctx, counterpartyId))) {
            return { items: [], totalItems: 0 };
        }
        const qb = this.connection
            .getRepository(ctx, Contract)
            .createQueryBuilder('k')
            .where('k.counterpartyId = :counterpartyId AND k.isCustomerContract = true', {
                counterpartyId,
            })
            .orderBy('k.isActive', 'DESC')
            .addOrderBy('k.name', 'ASC')
            .addOrderBy('k.id', 'ASC');
        const term = input.search?.trim();
        if (term) {
            qb.andWhere('(k.name ILIKE :term OR k.erpId ILIKE :term)', { term: likeTerm(term) });
        }
        if (input.withoutScan) {
            qb.andWhere(
                `k.isActive = true AND NOT EXISTS (SELECT 1 FROM contract_file f
                    WHERE f."contractId" = k.id AND f.kind = :scanKind)`,
                { scanKind: SCAN_KIND },
            );
        }
        const { items: contracts, totalItems } = await getPageAndCount(
            qb,
            clampTake(input.take ?? undefined),
            clampSkip(input.skip ?? undefined),
        );
        const files = await this.filesOfContracts(
            ctx,
            contracts.map(c => Number(c.id)),
        );
        return {
            items: contracts.map(c => {
                const own = files.filter(f => f.contractId === String(c.id));
                return {
                    id: String(c.id),
                    erpId: c.erpId,
                    name: c.name,
                    isActive: c.isActive,
                    currency: c.currency,
                    hasScan: own.some(f => f.kind === SCAN_KIND),
                    files: own,
                };
            }),
            totalItems,
        };
    }

    async filesOfContracts(ctx: RequestContext, contractIds: number[]): Promise<ContractFileRow[]> {
        if (!contractIds.length) return [];
        return ctxQuery<ContractFileRow[]>(
            this.connection,
            ctx,
            `${FILE_SELECT} WHERE f."contractId" = ANY($1::int[]) ORDER BY f."createdAt" DESC, f.id DESC`,
            [contractIds],
        );
    }

    // The customer's own counterparty only; files of every contract, newest first.
    async myFiles(
        ctx: RequestContext,
        input: { skip?: number | null; take?: number | null } = {},
    ): Promise<{ items: ContractFileRow[]; totalItems: number }> {
        const counterpartyId = await this.tradingPoints.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) return { items: [], totalItems: 0 };
        const scope = `WHERE k."counterpartyId" = $1`;
        const [{ count }] = await ctxQuery<Array<{ count: string }>>(
            this.connection,
            ctx,
            `SELECT count(*)::text AS count FROM contract_file f JOIN contract k ON k.id = f."contractId" ${scope}`,
            [String(counterpartyId)],
        );
        const take = clampTake(input.take ?? undefined);
        if (take === 0) return { items: [], totalItems: Number(count) };
        const items = await ctxQuery<ContractFileRow[]>(
            this.connection,
            ctx,
            `${FILE_SELECT} ${scope} ORDER BY f."createdAt" DESC, f.id DESC LIMIT $2 OFFSET $3`,
            [String(counterpartyId), take, clampSkip(input.skip ?? undefined)],
        );
        return { items, totalItems: Number(count) };
    }

    // Staff with ReadCounterparty see files of visible counterparties, anyone else only their own.
    async readForDownload(
        ctx: RequestContext,
        uuid: string,
    ): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
        const file = await this.connection
            .getRepository(ctx, ContractFile)
            .findOne({ where: { uuid } });
        if (!file) return null;
        const contract = await this.connection
            .getRepository(ctx, Contract)
            .findOne({ where: { id: file.contractId } });
        if (!contract || !(await this.canSee(ctx, contract.counterpartyId))) return null;
        const data = await this.storage.read(file.uuid);
        if (!data) return null;
        return { fileName: file.fileName, mimeType: file.mimeType, data };
    }

    private async canSee(ctx: RequestContext, counterpartyId: string): Promise<boolean> {
        if (!ctx.activeUserId) return false;
        if (ctx.userHasPermissions([CustomPermission.ReadCounterparty.Permission])) {
            return (await this.counterparties.findOneVisible(ctx, counterpartyId)) !== null;
        }
        const own = await this.tradingPoints.getCounterpartyIdForUser(ctx);
        return own !== null && String(own) === counterpartyId;
    }
}
