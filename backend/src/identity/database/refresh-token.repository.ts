import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, IsNull } from 'typeorm'
import { DefaultTypeOrmRepository } from '../../shared/database/core/typeorm'
import { RefreshTokenEntity } from './entities/refresh-token.entity'

type RefreshTokenCommand = {
  userId: number
  tokenHash: string
  expiresAt: Date
}

@Injectable()
export class RefreshTokenRepository extends DefaultTypeOrmRepository<RefreshTokenEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(RefreshTokenEntity, dataSource.manager)
  }

  async create(input: RefreshTokenCommand): Promise<void> {
    await this.save(
      new RefreshTokenEntity({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      }),
    )
  }

  /**
   * Reuso de refresh token fora do grace period (RFC 0004, Decisão 6) — sinal
   * de roubo. Revoga todas as sessões ativas do usuário, não só a reutilizada.
   */
  revokeAllForUser(userId: number): Promise<unknown> {
    return this.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    )
  }
}
