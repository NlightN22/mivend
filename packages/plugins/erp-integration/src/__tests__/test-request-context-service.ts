import type { RequestContextService } from '@vendure/core';
import { testRequestContext } from 'shared';

export const testRequestContextService = {
    create: async () => testRequestContext,
} as unknown as RequestContextService;
