import { OrderLine } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

// Kept outside OrderLine.customFields: Vendure compares every line custom field when merging
// addItemToOrder into an existing line, so a uuid there made every add a new line (#221).
@Entity('order_line_identity')
export class OrderLineIdentity {
    @PrimaryColumn({ type: 'integer' })
    orderLineId!: number;

    @OneToOne(() => OrderLine, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'orderLineId' })
    orderLine?: OrderLine;

    @Index({ unique: true })
    @Column({ type: 'uuid' })
    uuid!: string;
}
