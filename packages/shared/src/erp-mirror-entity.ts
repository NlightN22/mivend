import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Same columns as VendureEntity but without Vendure's bootstrap-bound id column, so mirrors run on a bare DataSource.
export abstract class ErpMirrorEntity {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
