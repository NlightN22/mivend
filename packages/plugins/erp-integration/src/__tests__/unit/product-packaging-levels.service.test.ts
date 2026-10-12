import { RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { describe, expect, it } from 'vitest';

import { ProductPackagingLevelsService } from '../../product-packaging-levels.service';

function serviceReturning(rows: unknown[]): ProductPackagingLevelsService {
    const builder = {
        innerJoin: () => builder,
        select: () => builder,
        addSelect: () => builder,
        where: () => builder,
        andWhere: () => builder,
        orderBy: () => builder,
        getRawMany: async () => rows,
    };
    const connection = {
        getRepository: () => ({ createQueryBuilder: () => builder }),
    } as unknown as TransactionalConnection;
    return new ProductPackagingLevelsService(connection);
}

describe('ProductPackagingLevelsService.getForProduct', () => {
    it('finds levels when the product id arrives as a number', async () => {
        const service = serviceReturning([{ productId: 27408, name: 'pack', ratioToBase: '12' }]);

        const levels = await service.getForProduct(
            {} as RequestContext,
            27408 as unknown as string,
        );

        expect(levels).toEqual([{ name: 'pack', ratioToBase: 12 }]);
    });
});
