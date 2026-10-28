import { shopApi } from '../api/client';
import { CatalogCollectionBySlugDocument } from '../api/generated/graphql';

// Shop API returns null for hidden, deleted, inactive and unknown slugs alike.
export async function isCollectionVisible(slug: string): Promise<boolean> {
    const result = await shopApi(CatalogCollectionBySlugDocument, { slug });
    return result.collection != null;
}
