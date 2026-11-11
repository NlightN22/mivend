import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

// The real entity extends VendureEntity, which needs a bootstrapped EntityIdStrategy; this mirrors its table.
@Entity('check_policy')
@Index('IDX_check_policy_global', ['checkCode', 'stage'], {
    unique: true,
    where: '"branchId" IS NULL',
})
@Index('IDX_check_policy_branch', ['checkCode', 'stage', 'branchId'], {
    unique: true,
    where: '"branchId" IS NOT NULL',
})
export class CheckPolicyMirror {
    @PrimaryGeneratedColumn() id!: number;
    @CreateDateColumn() createdAt!: Date;
    @UpdateDateColumn() updatedAt!: Date;
    @Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar' }) checkCode!: string;
    @Column({ type: 'varchar' }) stage!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar' }) consequence!: string;
    @Column({ type: 'varchar', nullable: true }) recipient!: string | null;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
}
