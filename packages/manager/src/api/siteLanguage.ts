import { adminApi } from './client';
import { SiteDefaultLanguageDocument } from './generated/graphql';

export async function fetchSiteDefaultLanguage(): Promise<string | null> {
    const { siteDefaultLanguage } = await adminApi(SiteDefaultLanguageDocument);
    return siteDefaultLanguage ?? null;
}
