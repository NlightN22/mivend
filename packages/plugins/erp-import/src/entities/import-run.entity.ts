import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { ImportRunStatus } from '../types';
import { ImportRunError } from './import-run-error.entity';

@Entity('erp_import_run')
export class ImportRun {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', unique: true })
    exchangeId!: string;

    @Column({ type: 'varchar' })
    status!: ImportRunStatus;

    @Column({ type: 'int', default: 0 })
    total!: number;

    @Column({ type: 'int', default: 0 })
    processed!: number;

    @Column({ type: 'int', default: 0 })
    failed!: number;

    @Column({ type: 'jsonb', nullable: true })
    payload!: object;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'timestamptz', nullable: true })
    finishedAt!: Date | null;

    @OneToMany(() => ImportRunError, e => e.run, { cascade: true })
    errors!: ImportRunError[];
}
