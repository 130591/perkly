import { Injectable, ConflictException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'
import {
	Repository,
	AccountEntity,
	UserEntity,
	UserRepository,
	UserActivationEntity,
	UserActivationRepository,
} from './database'
import { Token } from './token'

type NewTenant = {
	email: string
	companyName: string
	cnpj: string
	companyPhone: string
}

// RFC 0004, Decisão 12.
const ACTIVATION_TTL_MS = 5 * 24 * 60 * 60 * 1000

@Injectable()
export class Service {
	constructor(
		private readonly repository: Repository,
		private readonly userRepo: UserRepository,
		private readonly activationRepo: UserActivationRepository,
	) {}

	@Transactional()
	async createTenant(input: NewTenant) {
		const exists = await this.repository.findOne({ where: { cnpj: input.cnpj } })
		if (exists) throw new ConflictException('Account with this CNPJ already exists')

		const accountCreated = await this.repository.save(new AccountEntity({
			cnpj: input.cnpj,
			companyName: input.companyName,
			companyPhone: input.companyPhone,
		}))

		const userCreated = await this.userRepo.save(new UserEntity({
			email: input.email,
			accountId: accountCreated.id,
			role: 'ADMIN',
			status: 'pending_activation',
		}))

		const { token, tokenHash } = Token.generate()
		await this.activationRepo.save(new UserActivationEntity({
			userId: userCreated.id,
			tokenHash,
			expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
		}))

		// TODO: disparo do e-mail de boas-vindas/ativação fica para o módulo de
		// notificação (fora do escopo desta task). Até lá, o token cru volta na
		// resposta pra dar pra ativar manualmente.
		return { id: accountCreated.externalId, activationToken: token }
	}
}