import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Permission } from '@vendure/core';

import { SiteLanguageService } from './site-language.service';

@Resolver()
export class SiteLanguageResolver {
    constructor(private siteLanguage: SiteLanguageService) {}

    @Query()
    @Allow(Permission.Public)
    async siteDefaultLanguage(): Promise<string | null> {
        return (await this.siteLanguage.getDefault()) ?? null;
    }
}
