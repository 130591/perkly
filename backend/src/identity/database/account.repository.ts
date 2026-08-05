import { readFileSync } from 'fs'
import { join } from 'path'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { AccountEntity } from './entities/account.entity'
import { UserRole } from './entities/user.entity'

type AccountCommand = {
  companyName: string
  cnpj: string
  companyPhone: string
}

/** Loaded once at module init; see database/sql/team-members.sql. */
const TEAM_MEMBERS_SQL = readFileSync(
  join(__dirname, 'sql', 'team-members.sql'),
  'utf8',
)

@Injectable()
export class Repository extends DefaultTypeOrmRepository<AccountEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(AccountEntity, dataSource.manager)
  }

  async create(input: AccountCommand) {
    const account = await this.save(
      new AccountEntity({
        companyName: input.companyName,
        cnpj: input.cnpj,
        companyPhone: input.companyPhone,
      }),
    )
    return { id: account.id, externalId: account.externalId }
  }

  /** Read-model for the team screen — see team-members.sql. */
  async findMembers(accountId: number): Promise<TeamMemberRow[]> {
    const rows: RawTeamMemberRow[] = await this.manager.query(
      TEAM_MEMBERS_SQL,
      [accountId],
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    }))
  }
}

export type TeamMemberRow = {
  id: string
  name: string
  email: string
  role: UserRole
  status: 'active' | 'pending'
  createdAt: Date
}

type RawTeamMemberRow = {
  id: string
  name: string
  email: string
  role: UserRole
  status: 'active' | 'pending'
  created_at: Date
}
