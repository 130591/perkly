import { Injectable } from '@nestjs/common'
import { Password } from './password'
import { Repository, UserRepository } from './database'

// Única superfície pública de `identity` (RFC 0004, Decisão 3) — outros
// módulos injetam isso via DI, nunca importam entities/repos daqui direto.
@Injectable()
export class IdentityClient {
  constructor(
    private readonly accountRepo: Repository,
    private readonly userRepo: UserRepository,
  ) {}

  async getAccountById(accountId: string) {
    const account = await this.accountRepo.findOneById(accountId)
    if (!account) return null
    return { id: account.externalId, companyName: account.companyName }
  }

  async getUserById(userId: string) {
    const user = await this.userRepo.findOneById(userId)
    if (!user) return null
    return {
      id: user.externalId,
      email: user.email,
      name: user.name,
      role: user.role,
    }
  }

  /**
   * Step-up authentication (RFC 0004, Decisão 4) — confirma a senha no
   * momento de uma ação sensível. Quais ações exigem isso é decisão de cada
   * módulo chamador (campaign, payout), não de identity.
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.userRepo.findOneById(userId)
    if (!user?.passwordHash) return false
    return Password.verify(user.passwordHash, password)
  }
}
