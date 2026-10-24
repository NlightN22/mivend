import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { Administrator } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { isStaffUser } from '../../password-reset-handler';

// Mirror tables: Vendure's real Administrator needs bootstrap()'s EntityIdStrategy.
@Entity('user')
class TestUser {
    @PrimaryGeneratedColumn() id!: number;
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) lastName!: string;

    @OneToOne(() => TestUser)
    @JoinColumn({ name: 'userId' })
    user!: TestUser;
}

const { schema, extra } = testSchemaOptions('password_reset_recipient');
let dataSource: DataSource;
let connection: TransactionalConnection;
let staffUserId: number;
let customerUserId: number;
const ctx = {} as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestAdministrator, TestUser],
        synchronize: true,
    });
    await dataSource.initialize();
    connection = {
        getRepository: (_ctx: unknown, entity: unknown) => {
            if (entity !== Administrator) throw new Error('unexpected entity');
            return dataSource.getRepository(TestAdministrator);
        },
    } as unknown as TransactionalConnection;
    const users = dataSource.getRepository(TestUser);
    const staff = await users.save({});
    const customer = await users.save({});
    await dataSource.getRepository(TestAdministrator).save({ lastName: 'Staff', user: staff });
    staffUserId = staff.id;
    customerUserId = customer.id;
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('isStaffUser', () => {
    it('is true for a user owned by an administrator', async () => {
        expect(await isStaffUser(connection, ctx, staffUserId)).toBe(true);
    });

    it('is false for a user with no administrator, such as a customer', async () => {
        expect(await isStaffUser(connection, ctx, customerUserId)).toBe(false);
    });
});
