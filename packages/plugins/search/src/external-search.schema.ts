import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

// Fields the ElasticsearchPlugin adds to the shop `search` API and the storefront always sends.
// inStock narrows to the viewer's branch warehouses; priceRangeWithTax is accepted but not
// applied (per-customer prices are resolved in mivend, not filterable in search-service).
export const externalSearchSchema: DocumentNode = gql`
    input PriceRangeInput {
        min: Int!
        max: Int!
    }

    extend input SearchInput {
        inStock: Boolean
        priceRangeWithTax: PriceRangeInput
    }
`;
