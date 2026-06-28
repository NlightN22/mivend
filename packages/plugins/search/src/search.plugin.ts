import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { ElasticsearchPlugin } from '@vendure/elasticsearch-plugin';
import { CrossReferencePlugin, CrossReferenceService } from '@mivend/plugin-cross-reference';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import gql from 'graphql-tag';

import { SearchResultResolver } from './search.resolver';
import { SearchService } from './search.service';

const shopApiSchema = gql`
    extend type SearchResult {
        customerPrice: Int
    }
`;

const host = process.env.ELASTICSEARCH_HOST ?? 'http://localhost:9200';

const elasticsearchPlugin = ElasticsearchPlugin.init({
    host,
    indexSettings: {
        analysis: {
            analyzer: {
                russian_standard: {
                    type: 'russian',
                },
            },
        },
    },
    indexMappingProperties: {
        productName: {
            type: 'text',
            analyzer: 'russian_standard',
        },
        description: {
            type: 'text',
            analyzer: 'russian_standard',
        },
        'product-fullName': {
            type: 'text',
            analyzer: 'russian_standard',
        },
        'product-oemCodes': {
            type: 'keyword',
        },
    },
    customProductMappings: {
        fullName: {
            graphQlType: 'String',
            valueFn: product =>
                ((product.customFields as Record<string, unknown>).fullName as string) ?? '',
        },
        oemCodes: {
            graphQlType: '[String!]',
            valueFn: async (product, _variants, _lang, injector, ctx) => {
                const service = injector.get(CrossReferenceService);
                const refs = await service.findByProductId(ctx, Number(product.id));
                return refs.map(r => r.oemCode);
            },
        },
    },
    searchConfig: {
        mapQuery: (query, input) => {
            if (!input.term) return query;
            query.bool.must = [
                {
                    multi_match: {
                        query: input.term,
                        type: 'most_fields',
                        fuzziness: 'AUTO',
                        fields: [
                            'sku^5',
                            'product-oemCodes^4',
                            'productName^3',
                            'product-fullName^2',
                            'productVariantName^2',
                            'description^1',
                        ],
                    },
                },
            ];
            return query;
        },
    },
});

@VendurePlugin({
    imports: [PluginCommonModule, CrossReferencePlugin, PriceEntryPlugin, elasticsearchPlugin],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [SearchResultResolver],
    },
    providers: [SearchService],
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Product = [
            ...(config.customFields.Product ?? []),
            {
                name: 'fullName',
                type: 'string' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Full Name' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class SearchPlugin {}
