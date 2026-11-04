import { Injector, ProductVariant, RequestContext } from '@vendure/core';
import { CrossReferenceService } from '@mivend/plugin-cross-reference';

import { CodeKind, normalizeCode } from './code-query';

// Product-level so one query decides a product's group; the index prefixes custom product mappings with `product-`.
export const CODE_FIELDS: Record<CodeKind, string> = {
    sku: 'product-skusNormalized',
    partNumber: 'product-partNumberNormalized',
    manufacturerCode: 'product-oemCodesNormalized',
};

export const codeIndexMappingProperties = {
    [CODE_FIELDS.sku]: { type: 'keyword' as const },
    [CODE_FIELDS.partNumber]: { type: 'keyword' as const },
    [CODE_FIELDS.manufacturerCode]: { type: 'keyword' as const },
};

export const normalizedCodesOf = (values: Array<string | null | undefined>): string[] =>
    values.flatMap(value => (value ? [normalizeCode(value)] : [])).filter(code => code !== '');

export const codeProductMappings = {
    skusNormalized: {
        graphQlType: '[String!]' as const,
        public: false,
        valueFn: (_product: unknown, variants: ProductVariant[]): string[] =>
            normalizedCodesOf(variants.map(variant => variant.sku)),
    },
    partNumberNormalized: {
        graphQlType: '[String!]' as const,
        public: false,
        valueFn: (product: { customFields: unknown }): string[] =>
            normalizedCodesOf([
                (product.customFields as Record<string, unknown>).manufacturerPartNumber as
                    | string
                    | null,
            ]),
    },
    oemCodesNormalized: {
        graphQlType: '[String!]' as const,
        public: false,
        valueFn: async (
            product: { id: unknown },
            _variants: ProductVariant[],
            _languageCode: unknown,
            injector: Injector,
            ctx: RequestContext,
        ): Promise<string[]> => {
            const refs = await injector
                .get(CrossReferenceService)
                .findByProductId(ctx, Number(product.id));
            return normalizedCodesOf(refs.map(ref => ref.oemCode));
        },
    },
};
