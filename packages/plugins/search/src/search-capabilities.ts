import { Query, Resolver } from '@nestjs/graphql';

import { getSearchBackend, SearchBackend } from './types';

export interface SearchCapabilities {
    sortKeys: string[];
    priceRange: boolean;
}

// The internal (Elasticsearch) index never receives per-customer prices, so it cannot order or
// filter by price; search-service does it by the viewer's price type (`priceTypeId`).
export function capabilitiesFor(backend: SearchBackend): SearchCapabilities {
    const base = ['relevance', 'name_asc', 'name_desc'];
    return backend === 'external'
        ? { sortKeys: [...base, 'price_asc', 'price_desc'], priceRange: true }
        : { sortKeys: base, priceRange: false };
}

@Resolver()
export class SearchCapabilitiesResolver {
    @Query()
    searchCapabilities(): SearchCapabilities {
        return capabilitiesFor(getSearchBackend());
    }
}
