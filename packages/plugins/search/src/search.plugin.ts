import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    Type,
    VendurePlugin,
} from '@vendure/core';
import { ElasticsearchPlugin } from '@vendure/elasticsearch-plugin';
import { CrossReferenceService } from '@mivend/plugin-cross-reference';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import gql from 'graphql-tag';

import { ExternalSearchPlugin } from './external-search.plugin';
import { SearchResultResolver } from './search.resolver';
import { SearchService } from './search.service';
import { getSearchBackend } from './types';

const shopApiSchema = gql`
    extend type SearchResult {
        customerPrice: Int
        compareAtPrice: Int
        discountTiers: [DiscountTier!]!
    }
`;

// Kept as a function (not a module-level constant) so it is only ever invoked for
// SEARCH_BACKEND=internal — issue #69 requires the two backends never run at once.
function buildElasticsearchPlugin(): Type<unknown> {
    const rawHost = process.env.ELASTICSEARCH_HOST ?? 'http://localhost:9200';
    // ElasticsearchPlugin appends :port to host — strip any existing port from the URL
    const hostUrl = new URL(rawHost);
    const host = `${hostUrl.protocol}//${hostUrl.hostname}`;
    const port = hostUrl.port ? Number(hostUrl.port) : 9200;

    return ElasticsearchPlugin.init({
        host,
        port,
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
}

@VendurePlugin({
    imports: [PluginCommonModule, PriceEntryPlugin],
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

// Single entry point vendure-config.ts spreads into its top-level plugins array — the
// SEARCH_BACKEND branch (issue #69) is decided here, once at bootstrap, not in vendure-config.ts.
// `SearchPlugin` (customerPrice/compareAtPrice/discountTiers) is backend-agnostic and always
// registered; exactly one of ElasticsearchPlugin / ExternalSearchPlugin is added alongside it —
// never both, no fallback.
function buildSearchPlugins(): Array<Type<unknown>> {
    const backend = getSearchBackend();
    if (backend === 'external') {
        if (!process.env.SEARCH_SERVICE_URL) {
            throw new Error(
                'SEARCH_BACKEND=external requires SEARCH_SERVICE_URL to be set (see ' +
                    'docs/environments.md) — refusing to start with no search-service target.',
            );
        }
        return [SearchPlugin, ExternalSearchPlugin];
    }
    return [buildElasticsearchPlugin(), SearchPlugin];
}

export const searchPlugins = buildSearchPlugins();
