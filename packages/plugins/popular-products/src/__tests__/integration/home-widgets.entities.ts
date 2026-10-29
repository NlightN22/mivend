import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

// Replicas of the Vendure tables: real entities need a bootstrapped EntityIdStrategy to load.
class TProductCustomFields {
    @Column({ name: 'customFieldsOnsale', type: 'boolean', default: false }) onSale!: boolean;
    @Column({ name: 'customFieldsErpcreatedat', type: 'timestamp', nullable: true })
    erpCreatedAt!: Date | null;
}

@Entity('product')
export class TProduct {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column(() => TProductCustomFields, { prefix: false }) customFields!: TProductCustomFields;
}

@Entity('product_variant')
export class TVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productId!: number;
    @ManyToOne(() => TProduct) product!: TProduct;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('order')
export class TOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) state!: string;
}

@Entity('order_line')
export class TOrderLine {
    @PrimaryGeneratedColumn() id!: number;
    @ManyToOne(() => TOrder) order!: TOrder;
    @ManyToOne(() => TVariant) productVariant!: TVariant;
    @Column({ type: 'int' }) quantity!: number;
}

class TLocationCustomFields {
    @Column({ name: 'customFieldsWarehouseerpid', type: 'varchar', nullable: true })
    warehouseErpId!: string | null;
}

@Entity('stock_location')
export class TLocation {
    @PrimaryGeneratedColumn() id!: number;
    @Column(() => TLocationCustomFields, { prefix: false }) customFields!: TLocationCustomFields;
}

class TLevelCustomFields {
    @Column({ name: 'customFieldsErpavailablequantity', type: 'int', nullable: true })
    erpAvailableQuantity!: number | null;
}

@Entity('stock_level')
export class TLevel {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) stockLocationId!: number;
    @Column({ type: 'int' }) stockOnHand!: number;
    @Column({ type: 'int', default: 0 }) stockAllocated!: number;
    @Column(() => TLevelCustomFields, { prefix: false }) customFields!: TLevelCustomFields;
}

@Entity('reservation')
export class TReservation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'varchar' }) stockLocationId!: string;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'varchar' }) status!: string;
}
