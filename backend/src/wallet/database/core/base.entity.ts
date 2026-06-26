import { randomUUID } from 'crypto'
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * id         — BIGSERIAL primary key, internal only (fast joins/indexes)
 * externalId — UUID, exposed via API/URLs
 *
 * Do not extend TypeORM's BaseEntity to avoid coupling with TypeORM.
 */
export abstract class DefaultEntity<T> {
  constructor(data?: Partial<T>) {
    if (data) {
      Object.assign(this, data)
    }
    
    if (!this.externalId) {
      this.externalId = randomUUID()
    }
  }

  @BeforeInsert()
  beforeInsert(): void {
    this.createdAt = this.createdAt || new Date()
    this.updatedAt = new Date()
  }

  @BeforeUpdate()
  beforeUpdate(): void {
    this.updatedAt = new Date()
  }

  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number

  @Column({ name: 'external_id', type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  externalId: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null
}