import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, UserInputError } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ContractFileReadService, type ContractListInput } from './contract-file-read.service';
import { ContractFileService, type UploadedFile } from './contract-file.service';
import { toGqlFile } from './contract-file-view';

@Resolver()
export class ContractFileAdminResolver {
    constructor(
        private readonly files: ContractFileService,
        private readonly reads: ContractFileReadService,
    ) {}

    @Query()
    @Allow(CustomPermission.ReadCounterparty.Permission)
    async counterpartyContracts(
        @Ctx() ctx: RequestContext,
        @Args() args: ContractListInput & { counterpartyId: string },
    ): Promise<unknown> {
        const page = await this.reads.contractsOf(ctx, String(args.counterpartyId), args);
        return {
            totalItems: page.totalItems,
            items: page.items.map(c => ({ ...c, files: c.files.map(toGqlFile) })),
        };
    }

    @Mutation()
    @Allow(CustomPermission.ManageContractFiles.Permission)
    async uploadContractFile(
        @Ctx() ctx: RequestContext,
        @Args() args: { contractId: string; kind: string; file: Promise<UploadedFile> },
    ): Promise<unknown> {
        const saved = await this.files.upload(ctx, {
            contractId: String(args.contractId),
            kind: args.kind,
            file: args.file,
        });
        const own = (await this.reads.filesOfContracts(ctx, [saved.contractId])).find(
            f => f.uuid === saved.uuid,
        );
        if (!own) throw new UserInputError('Contract file not found');
        return toGqlFile(own);
    }

    @Mutation()
    @Allow(CustomPermission.ManageContractFiles.Permission)
    deleteContractFile(
        @Ctx() ctx: RequestContext,
        @Args() args: { uuid: string },
    ): Promise<boolean> {
        return this.files.remove(ctx, args.uuid);
    }
}

@Resolver()
export class ContractFileShopResolver {
    constructor(private readonly reads: ContractFileReadService) {}

    @Query()
    @Allow(Permission.Authenticated)
    async myContractFiles(
        @Ctx() ctx: RequestContext,
        @Args() args: { skip?: number; take?: number },
    ): Promise<unknown> {
        const page = await this.reads.myFiles(ctx, args);
        return { totalItems: page.totalItems, items: page.items.map(toGqlFile) };
    }
}
