import { shopApi } from './client';
import { SiteDefaultLanguageDocument } from './generated/graphql';

export async function fetchSiteDefaultLanguage(): Promise<string | null> {
    const { siteDefaultLanguage } = await shopApi(SiteDefaultLanguageDocument);
    return siteDefaultLanguage ?? null;
}
