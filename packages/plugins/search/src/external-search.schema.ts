import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

// inStock is scoped to the viewer's branch warehouses; priceRangeWithTax is accepted but ignored,
// since per-customer prices are resolved in mivend and search-service cannot filter on them.
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
