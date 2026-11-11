import { Injectable } from '@nestjs/common';

import type { GlobalSearchProvider } from './types';

// Each entity plugin registers its own provider; the search plugin never reaches into their tables.
@Injectable()
export class StaffSearchRegistry {
    private readonly providers = new Map<string, GlobalSearchProvider>();

    register(provider: GlobalSearchProvider): void {
        this.providers.set(provider.kind, provider);
    }

    all(): GlobalSearchProvider[] {
        return [...this.providers.values()].sort((a, b) => a.position - b.position);
    }
}
