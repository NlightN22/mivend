import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';

export type DiscountGrantScopeType = 'all' | 'customer';

// scopeType 'all' = no counterparties attached (company-wide, legacy behavior).
// All counterparties of a 'customer' grant share one validTo; no per-customer expiry.
@Entity()
export class DiscountGrant extends UuidEntity {
    constructor(input?: DeepPartial<DiscountGrant>) {
        super(input);
    }

    // Flat per-instance sequence via NumberingService.next(ctx, 'discount-grant') — not
    // order-scoped, DiscountGrant has no orderId.
    @Index()
    @Column({ type: 'varchar' })
    number!: string;

    @Column({ type: 'varchar' })
    discountRuleId!: string;

    @Column({ type: 'varchar' })
    scopeType!: DiscountGrantScopeType;

    @Column({ type: 'timestamp' })
    validTo!: Date;

    @Column({ type: 'varchar' })
    sourceApprovalRequestId!: string;

    @ManyToMany(() => Counterparty)
    @JoinTable({ name: 'discount_grant_counterparty' })
    counterparties!: Counterparty[];
}
