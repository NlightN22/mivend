import { Injectable, Logger } from '@nestjs/common';
import {
    Asset,
    AssetService,
    CollectionService,
    ConfigService,
    Facet,
    FacetService,
    FacetValue,
    FacetValueService,
    LanguageCode,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    CATEGORY_FACET_CODE,
    buildCategoryFacetFilter,
    categorySlug,
    ensureParentCategoryCollection,
    moveCategoryIfParentChanged,
    recomputeCategoryTree,
} from 'shared';
import path from 'path';
import type { CategoryRecord } from '../types';

const loggerCtx = 'CategoryHandler';

@Injectable()
export class CategoryHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly facetService: FacetService,
        private readonly facetValueService: FacetValueService,
        private readonly collectionService: CollectionService,
        private readonly assetService: AssetService,
        private readonly configService: ConfigService,
    ) {}

    async upsert(ctx: RequestContext, record: CategoryRecord): Promise<void> {
        const facet = await this.ensureCategoryFacet(ctx);
        const facetValue = await this.ensureFacetValue(ctx, facet, record);
        await this.ensureCollection(ctx, record, String(facetValue.id));
        if (record.iconFile) await this.ensureIcon(ctx, record);
    }

    private async ensureIcon(ctx: RequestContext, record: CategoryRecord): Promise<void> {
        const fileName = record.iconFile as string;
        if (fileName !== path.basename(fileName)) {
            throw new Error(`iconFile must be a plain file name, got "${fileName}"`);
        }
        const collection = await this.collectionService.findOneBySlug(
            ctx,
            categorySlug(record.erpId),
            ['featuredAsset'],
        );
        if (!collection || collection.featuredAsset) return;

        const { assetImportStrategy } = this.configService.importExportOptions;
        const stream = await assetImportStrategy.getStreamFromPath(fileName);
        const asset = await this.assetService.createFromFileStream(stream, fileName, ctx);
        if (!(asset instanceof Asset))
            throw new Error(`Icon "${fileName}" was rejected: ${asset.message}`);
        await this.collectionService.update(ctx, {
            id: collection.id,
            featuredAssetId: asset.id,
            assetIds: [asset.id],
        });
    }

    // Called once after a batch containing categories, so parents list their whole subtree.
    async recomputeFilters(ctx: RequestContext): Promise<void> {
        await recomputeCategoryTree(ctx, {
            connection: this.connection,
            collectionService: this.collectionService,
            facetService: this.facetService,
            facetValueService: this.facetValueService,
        });
    }

    private async ensureCategoryFacet(ctx: RequestContext): Promise<Facet> {
        const existing = await this.facetService.findByCode(
            ctx,
            CATEGORY_FACET_CODE,
            LanguageCode.en,
        );
        if (existing) return existing;
        return this.facetService.create(ctx, {
            code: CATEGORY_FACET_CODE,
            isPrivate: false,
            translations: [{ languageCode: LanguageCode.en, name: 'Category' }],
        });
    }

    private async ensureFacetValue(
        ctx: RequestContext,
        facet: { id: string | number },
        record: CategoryRecord,
    ): Promise<FacetValue> {
        const all = await this.facetValueService.findByFacetId(ctx, facet.id);
        const existing = all.find(v => v.code === record.erpId);

        if (existing) {
            return this.facetValueService.update(ctx, {
                id: existing.id,
                translations: [{ languageCode: LanguageCode.en, name: record.name }],
            });
        }

        return this.facetValueService.create(ctx, facet as never, {
            facetId: String(facet.id),
            code: record.erpId,
            translations: [{ languageCode: LanguageCode.en, name: record.name }],
        });
    }

    private async ensureCollection(
        ctx: RequestContext,
        record: CategoryRecord,
        facetValueId: string,
    ): Promise<void> {
        const slug = categorySlug(record.erpId);
        const existing = await this.collectionService.findOneBySlug(ctx, slug);

        const filters = buildCategoryFacetFilter([facetValueId]);
        let parentErpId = record.parentErpId ?? undefined;
        if (parentErpId === record.erpId) {
            Logger.warn(
                `category ${record.erpId}: parentErpId points to itself, ignoring`,
                loggerCtx,
            );
            parentErpId = undefined;
        }
        const parent = parentErpId
            ? await ensureParentCategoryCollection(ctx, this.collectionService, parentErpId)
            : undefined;
        const translations = [
            { languageCode: LanguageCode.en, name: record.name, slug, description: '' },
        ];

        if (existing) {
            await this.collectionService.update(ctx, { id: existing.id, translations, filters });
            await moveCategoryIfParentChanged(ctx, this.collectionService, existing, parent?.id);
            Logger.verbose(`Updated collection erpId=${record.erpId}`, loggerCtx);
            return;
        }

        await this.collectionService.create(ctx, {
            parentId: parent?.id,
            isPrivate: false,
            translations,
            filters,
            customFields: { feedHidden: false },
        });
        Logger.verbose(`Created collection erpId=${record.erpId}`, loggerCtx);
    }
}
