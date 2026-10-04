import gql from 'graphql-tag';

// Fields the ElasticsearchPlugin adds to the shop `search` API and the storefront always sends.
// inStock/priceRangeWithTax inputs are accepted but not applied: search-service only returns
// sellable offers, and per-customer prices are resolved in mivend, not filterable there.
export const externalSearchSchema = gql`
    input PriceRangeInput {
        min: Int!
        max: Int!
    }

    extend input SearchInput {
        inStock: Boolean
        priceRangeWithTax: PriceRangeInput
    }

    extend type SearchResult {
        inStock: Boolean!
    }
`;
