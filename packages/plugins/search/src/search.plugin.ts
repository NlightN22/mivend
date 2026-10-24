import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    Type,
    VendurePlugin,
} from '@vendure/core';
import { ElasticsearchPlugin } from '@vendure/elasticsearch-plugin';
import { CrossReferenceService } from '@mivend/plugin-cross-reference';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { ReservationPlugin } from '@mivend/plugin-reservation';
import gql from 'graphql-tag';

import { ExternalSearchPlugin } from './external-search.plugin';
import { SearchCapabilitiesResolver } from './search-capabilities';
import { SearchResultAvailabilityResolver } from './search-result-availability.resolver';
import { SearchResultResolver } from './search.resolver';
import {
    HAS_ORGANIZATION_FIELD,
    hasOrganizationMapping,
    restrictToSellable,
} from './sellable-filter';
import { ShopSearchFacetValuesResolver } from './shop-search-facet-values.resolver';
import { SearchService } from './search.service';
import { getSearchBackend } from './types';

const adminApiSchema = gql`
    extend type SearchResult {
        "False when the variant has no organization (seller of record) and cannot be ordered."
        availableForOrder: Boolean!
    }
`;

const shopApiSchema = gql`
    type SearchCapabilities {
        sortKeys: [String!]!
        priceRange: Boolean!
    }

    extend type Query {
        searchCapabilities: SearchCapabilities!
    }

    extend type SearchResult {
        customerPrice: Int
        compareAtPrice: Int
        discountTiers: [DiscountTier!]!
        stockLevel: String!
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
        // A separate prefix keeps a throwaway e2e stack's indices away from the dev contour's.
        indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || 'vendure-',
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
            [HAS_ORGANIZATION_FIELD]: {
                type: 'boolean',
            },
        },
        customProductVariantMappings: {
            hasOrganization: hasOrganizationMapping,
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
            mapQuery: (query, input, _searchConfig, _channelId, enabledOnly) => {
                restrictToSellable(query, enabledOnly);
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
    imports: [PluginCommonModule, PriceEntryPlugin, ReservationPlugin, AccessControlPlugin],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [
            SearchResultResolver,
            SearchCapabilitiesResolver,
            ShopSearchFacetValuesResolver,
        ],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [SearchResultAvailabilityResolver],
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

// Decided here at bootstrap, so vendure-config.ts never branches on SEARCH_BACKEND.
// SearchPlugin always added; exactly one of ElasticsearchPlugin/ExternalSearchPlugin, never both.
function buildSearchPlugins(): Array<Type<unknown>> {
    const backend = getSearchBackend();
    if (backend === 'external') {
        for (const name of ['SEARCH_SERVICE_URL', 'SEARCH_SERVICE_API_KEY']) {
            if (!process.env[name]) {
                throw new Error(
                    `SEARCH_BACKEND=external requires ${name} to be set (see ` +
                        'docs/environments.md) — refusing to start without it.',
                );
            }
        }
        return [SearchPlugin, ExternalSearchPlugin];
    }
    // Before ElasticsearchPlugin: the first registered SearchResponse resolver wins, ours must override its own.
    return [SearchPlugin, buildElasticsearchPlugin()];
}

export const searchPlugins = buildSearchPlugins();
