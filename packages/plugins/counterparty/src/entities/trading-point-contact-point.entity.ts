import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TradingPoint } from './trading-point.entity';
import { ContactPointLink } from './contact-link.base';

@Entity()
@Index(['tradingPointId', 'contactPointId'], { unique: true })
export class TradingPointContactPoint extends ContactPointLink {
    constructor(input?: DeepPartial<TradingPointContactPoint>) {
        super(input);
    }

    @Column({ type: 'int' })
    tradingPointId!: number;

    @ManyToOne(() => TradingPoint, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tradingPointId' })
    owner!: TradingPoint;
}
