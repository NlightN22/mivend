import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ImportRun } from './import-run.entity';

@Entity('erp_import_run_error')
export class ImportRunError {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ManyToOne(() => ImportRun, r => r.errors, { onDelete: 'CASCADE' })
    run!: ImportRun;

    @Column({ type: 'int' })
    recordIndex!: number;

    @Column({ type: 'text' })
    message!: string;
}
