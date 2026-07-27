import { Column, Entity } from 'typeorm'
import { DefaultEntity } from '../../../shared/database/core/base.entity'

// Tenant = account (RFC 0004, Decisão 1) — não existe uma entidade "empresa" separada.
@Entity('accounts')
export class AccountEntity extends DefaultEntity<AccountEntity> {
  @Column({ name: 'company_name' })
  companyName: string

  @Column({ type: 'varchar', length: 14, unique: true })
  cnpj: string

  @Column({ name: 'company_phone' })
  companyPhone: string
}
