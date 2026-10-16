import {
    Column,
    CreateDateColumn,
    DataSource,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    CheckPolicyService,
    CheckRegistry,
    CheckStaleRequestService,
    CheckStaleRequestWriter,
    ChecksService,
} from '@mivend/plugin-checks';
import {
    OrderCheckStaleService,
    OrderCheckSubjectLoader,
    OrderCheckSubjectRegistrar,
    OrderChecksService,
} from '@mivend/plugin-reservation';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderCheckDataService } from '../../../order-checks/order-check-data.service';
import { OrderCheckHealthService } from '../../../order-checks/order-check-health.service';
import { OrderCheckProvidersRegistrar } from '../../../order-checks/order-check-providers.registrar';
import { StockOrganizationReadService } from '../../../stock-organization-read.service';

// Plain mirrors on the real table shapes (VendureEntity needs a bootstrapped id strategy); the
// production services run unmodified, matched by class name in the connection shim below.
abstract class Base {
    @PrimaryGeneratedColumn() id!: number;
    @CreateDateColumn() createdAt!: Date;
    @UpdateDateColumn() updatedAt!: Date;
}
abstract class UuidBase extends Base {
    @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' }) uuid!: string;
}
class OrderFields {
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
    @Column({ name: 'customFieldsHascheckfindings', type: 'boolean', default: false })
    hasCheckFindings!: boolean;
}
class LineFields {
    @Column({ name: 'customFieldsOrganizationid', type: 'int', nullable: true })
    organizationId!: number | null;
}
class StockFields {
    @Column({ name: 'customFieldsErpavailablequantity', type: 'int', nullable: true })
    erpAvailableQuantity!: number | null;
}

@Entity('product_variant')
class VariantM {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productId!: number;
    @Column({ type: 'varchar' }) sku!: string;
    @Column({ name: 'customFieldsOrganizationid', type: 'int', nullable: true })
    organizationId!: number | null;
}
@Entity('order')
class OrderM extends Base {
    @Column({ type: 'varchar', default: 'PaymentAuthorized' }) state!: string;
    @Column({ type: 'boolean', default: false }) active!: boolean;
    @Column({ type: 'varchar', default: 'ORD-1' }) code!: string;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @Column(() => OrderFields, { prefix: false }) customFields!: OrderFields;
    @OneToMany(() => OrderLineM, l => l.order) lines!: OrderLineM[];
}
@Entity('order_line')
class OrderLineM extends Base {
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) quantity!: number;
    @Column(() => LineFields, { prefix: false }) customFields!: LineFields;
    @ManyToOne(() => OrderM, o => o.lines) @JoinColumn({ name: 'orderId' }) order!: OrderM;
    @ManyToOne(() => VariantM) @JoinColumn({ name: 'productVariantId' }) productVariant!: VariantM;
}
@Entity('reservation')
class ReservationM extends Base {
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'varchar' }) stockLocationId!: string;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'varchar' }) status!: string;
    @Column({ type: 'varchar' }) creationMethod!: string;
}
@Entity('stock_level')
class StockLevelM extends Base {
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) stockLocationId!: number;
    @Column({ type: 'int' }) stockOnHand!: number;
    @Column({ type: 'int', default: 0 }) stockAllocated!: number;
    @Column(() => StockFields, { prefix: false }) customFields!: StockFields;
}
@Entity('contract')
class ContractM extends Base {
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) organizationId!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'boolean', nullable: true }) isCustomerContract!: boolean | null;
}
@Entity('storage_location_assignment')
class AssignmentM extends Base {
    @Column({ type: 'varchar' }) entityId!: string;
    @Column({ type: 'varchar' }) productId!: string;
    @Column({ type: 'varchar' }) organizationErpId!: string;
    @Column({ type: 'varchar', default: '' }) warehouseId!: string;
}
@Entity('stock_organization')
@Unique(['productId', 'organizationErpId'])
class StockOrgM extends Base {
    @Column({ type: 'varchar' }) productId!: string;
    @Column({ type: 'varchar' }) organizationErpId!: string;
    @Column({ type: 'double precision', default: 0 }) quantity!: number;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}
@Entity('organization_requisites')
class RequisitesM extends Base {
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
}
@Entity('check_policy')
@Index('IDX_check_policy_global', ['checkCode', 'stage'], {
    unique: true,
    where: '"branchId" IS NULL',
})
@Index('IDX_check_policy_branch', ['checkCode', 'stage', 'branchId'], {
    unique: true,
    where: '"branchId" IS NOT NULL',
})
class PolicyM extends UuidBase {
    @Column({ type: 'varchar' }) checkCode!: string;
    @Column({ type: 'varchar' }) stage!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar' }) consequence!: string;
    @Column({ type: 'varchar', nullable: true }) recipient!: string | null;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
}
@Entity('check_policy_history')
class PolicyHistoryM extends UuidBase {
    @Column({ type: 'int' }) checkPolicyId!: number;
    @Column({ type: 'varchar', nullable: true }) changedByUserId!: string | null;
    @Column({ type: 'jsonb' }) before!: unknown;
    @Column({ type: 'jsonb' }) after!: unknown;
}
@Entity('check_result')
class ResultM extends UuidBase {
    @Column({ type: 'varchar' }) subjectType!: string;
    @Column({ type: 'varchar' }) subjectId!: string;
    @Column({ type: 'varchar' }) checkCode!: string;
    @Column({ type: 'varchar', nullable: true }) stage!: string | null;
    @Column({ type: 'varchar', nullable: true }) lineRef!: string | null;
    @Column({ type: 'varchar' }) severity!: string;
    @Column({ type: 'varchar' }) messageKey!: string;
    @Column({ type: 'jsonb' }) facts!: unknown;
    @Column({ type: 'varchar', nullable: true }) dataVersion!: string | null;
    @Column({ type: 'timestamp' }) computedAt!: Date;
    @Column({ type: 'boolean', default: false }) stale!: boolean;
}

@Entity('order_check_failure')
class FailureM extends UuidBase {
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar' }) stage!: string;
    @Column({ type: 'text' }) message!: string;
}

@Entity('check_stale_request')
@Unique(['kind', 'key'])
class StaleRequestM extends UuidBase {
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'varchar' }) key!: string;
    @Column({ type: 'int', default: 1 }) version!: number;
}

const mirrors: Record<string, unknown> = {
    CheckStaleRequest: StaleRequestM,
    OrderCheckFailure: FailureM,
    Order: OrderM,
    OrderLine: OrderLineM,
    Reservation: ReservationM,
    StockLevel: StockLevelM,
    Contract: ContractM,
    StorageLocationAssignment: AssignmentM,
    StockOrganization: StockOrgM,
    OrganizationRequisites: RequisitesM,
    CheckPolicy: PolicyM,
    CheckPolicyHistory: PolicyHistoryM,
    CheckResult: ResultM,
};

export interface SeedLine {
    sku: string;
    productErpId: string;
    quantity: number;
    // Organization the line is stamped with; omitted means unknown.
    organizationErpId?: string;
}

export interface OrderChecksWorld {
    dataSource: DataSource;
    connection: TransactionalConnection;
    ctx: RequestContext;
    registry: CheckRegistry;
    policies: CheckPolicyService;
    checks: ChecksService;
    orderChecks: OrderChecksService;
    stale: OrderCheckStaleService;
    requests: CheckStaleRequestService;
    health: OrderCheckHealthService;
    data: OrderCheckDataService;
    // Branch the stub visibility lets the actor see; null sees every order.
    visibleBranch: { value: string | null };
    seedOrder(lines: SeedLine[], options?: { branchId?: string; state?: string }): Promise<string>;
    seedContract(organizationErpId: string, over?: Partial<ContractM>): Promise<void>;
    seedAssignment(
        productErpId: string,
        organizationErpId: string,
        warehouseId?: string,
    ): Promise<void>;
    seedStock(productErpId: string, organizationErpId: string, quantity: number): Promise<void>;
    results(orderId: string): Promise<Array<Record<string, unknown>>>;
    close(): Promise<void>;
}

export const BUYER_COUNTERPARTY = '77';
export const WAREHOUSE = 'wh-1';

export async function createOrderChecksWorld(fileTag: string): Promise<OrderChecksWorld> {
    const { schema, extra } = testSchemaOptions(fileTag);
    await createTestSchema(schema);
    const dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [...Object.values(mirrors), OrderLineM, VariantM] as never[],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE product (id SERIAL PRIMARY KEY, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE customer (id SERIAL PRIMARY KEY, "customFieldsCounterpartyid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE stock_location (id SERIAL PRIMARY KEY, "customFieldsWarehouseerpid" varchar)`,
    );
    await dataSource.query(
        `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ('${BUYER_COUNTERPARTY}')`,
    );
    await dataSource.query(
        `INSERT INTO stock_location ("customFieldsWarehouseerpid") VALUES ('${WAREHOUSE}')`,
    );

    const requisitesId = async (erpId: string): Promise<number> => {
        const repo = dataSource.getRepository(RequisitesM);
        const row =
            (await repo.findOneBy({ erpId })) ?? (await repo.save({ erpId, legalName: erpId }));
        return row.id;
    };

    const base = createTestConnection(dataSource);
    const connection = {
        rawConnection: dataSource,
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: unknown, entity: { name: string } | string) =>
            base.getRepository(
                c as never,
                typeof entity === 'string' ? entity : (mirrors[entity.name] as never),
            ),
    } as unknown as TransactionalConnection;

    const visibleBranch = { value: null as string | null };
    const visibility = {
        buildVisibleOrdersQuery: async () => {
            const qb = dataSource.getRepository(OrderM).createQueryBuilder('o');
            if (visibleBranch.value !== null) {
                qb.where('o."customFieldsBranchid" = :b', { b: visibleBranch.value });
            }
            return qb;
        },
    };
    const counterparties = {
        getForCustomer: async () => ({ id: BUYER_COUNTERPARTY }),
    };
    const availability = {
        findBranchStockLocationIds: async () => ['1'],
    };

    const registry = new CheckRegistry();
    const writer = new CheckStaleRequestWriter(connection);
    const policies = new CheckPolicyService(
        connection,
        registry,
        { publish: () => undefined } as never,
        writer,
    );
    const checks = new ChecksService(connection, registry, policies);
    const requests = new CheckStaleRequestService(
        connection,
        { create: async () => ({ activeUserId: 'user-1' }) } as never,
        checks,
    );
    const loader = new OrderCheckSubjectLoader(
        connection,
        counterparties as never,
        availability as never,
    );
    const registrar = new OrderCheckSubjectRegistrar(registry, loader, visibility as never);
    registrar.onModuleInit();
    const data = new OrderCheckDataService(
        connection,
        new StockOrganizationReadService(connection),
    );
    new OrderCheckProvidersRegistrar(registry, data).onModuleInit();

    const world: OrderChecksWorld = {
        dataSource,
        connection,
        ctx: { activeUserId: 'user-1' } as unknown as RequestContext,
        registry,
        policies,
        checks,
        orderChecks: new OrderChecksService(connection, checks, registry, registrar),
        stale: new OrderCheckStaleService(connection, checks, writer, requests),
        requests,
        health: new OrderCheckHealthService(dataSource),
        data,
        visibleBranch,
        async seedOrder(lines, options = {}) {
            const [order] = await dataSource.query(
                `INSERT INTO "order" (state, active, code, "customerId", "customFieldsBranchid")
                 VALUES ($1, false, 'ORD-X', 1, $2) RETURNING id`,
                [options.state ?? 'PaymentAuthorized', options.branchId ?? 'branch-a'],
            );
            for (const line of lines) {
                const [product] = await dataSource.query(
                    `INSERT INTO product ("customFieldsExternalid") VALUES ($1) RETURNING id`,
                    [line.productErpId],
                );
                const [variant] = await dataSource.query(
                    `INSERT INTO product_variant ("productId", sku) VALUES ($1, $2) RETURNING id`,
                    [product.id, line.sku],
                );
                await dataSource.query(
                    `INSERT INTO order_line ("orderId", "productVariantId", quantity, "customFieldsOrganizationid")
                     VALUES ($1, $2, $3, $4)`,
                    [
                        order.id,
                        variant.id,
                        line.quantity,
                        line.organizationErpId ? await requisitesId(line.organizationErpId) : null,
                    ],
                );
            }
            return String(order.id);
        },
        async seedContract(organizationErpId, over = {}) {
            await dataSource.getRepository(ContractM).save({
                erpId: `c-${Math.random()}`,
                counterpartyId: BUYER_COUNTERPARTY,
                organizationId: organizationErpId,
                isActive: true,
                isCustomerContract: true,
                ...over,
            });
        },
        async seedAssignment(productErpId, organizationErpId, warehouseId = WAREHOUSE) {
            await dataSource.getRepository(AssignmentM).save({
                entityId: `loc-${Math.random()}`,
                productId: productErpId,
                organizationErpId,
                warehouseId,
            });
        },
        async seedStock(productErpId, organizationErpId, quantity) {
            await dataSource
                .getRepository(StockOrgM)
                .upsert({ productId: productErpId, organizationErpId, quantity }, [
                    'productId',
                    'organizationErpId',
                ]);
        },
        results: orderId =>
            dataSource.query(
                `SELECT "checkCode", stage, stale, severity, "lineRef", facts FROM check_result
                  WHERE "subjectId" = $1 ORDER BY "checkCode", id`,
                [orderId],
            ),
        async close() {
            await dataSource.destroy();
            await dropTestSchema(schema);
        },
    };
    return world;
}

export async function seedReservation(
    world: OrderChecksWorld,
    orderId: string,
    creationMethod: string,
): Promise<void> {
    await world.dataSource.getRepository(ReservationM).save({
        orderId,
        productVariantId: '1',
        stockLocationId: '1',
        quantity: 1,
        status: 'active',
        creationMethod,
    });
}

export async function resetWorld(world: OrderChecksWorld): Promise<void> {
    await world.dataSource.query(
        `TRUNCATE check_result, check_stale_request, order_check_failure, check_policy_history, check_policy, "order", order_line, product,
         product_variant, contract, storage_location_assignment, stock_organization,
         organization_requisites, reservation, stock_level RESTART IDENTITY CASCADE`,
    );
    world.visibleBranch.value = null;
}
