import { Entity } from 'typeorm'
import { DefaultEntity } from '../base.entity'

/**
 * `batch` table used by the bulk-import flow (`Repository.createBatch`).
 *
 * TODO: declare the real columns once the `mapper` module that produces the
 * batch rows exists. They were not present in the codebase at conversion time,
 * so only the DefaultEntity columns are defined here.
 */
@Entity('batch')
export class BatchEntity extends DefaultEntity<BatchEntity> {}
