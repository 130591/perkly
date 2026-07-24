import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import { ClaimService } from './service'
import { ConfirmClaimBody } from './transport'

/**
 * Endpoints do destinatário — "abrir link" e "informar chave Pix" da jornada.
 * `claimId` no path é o `externalId` do Claim: o próprio token do link, sem
 * indireção. Nenhum auth aqui além da posse do link (mesmo modelo de link
 * mágico do resto do produto).
 */
@Controller('claims')
export class ClaimController {
  constructor(private readonly claim: ClaimService) {}

  @Get(':claimId')
  async open(@Param('claimId', ParseUUIDPipe) claimId: string) {
    const claim = await this.claim.findById(claimId)
    return {
      status: claim.status,
      amount: claim.amountCents.toString(),
      expiresAt: claim.expiresAt,
    }
  }

  @Post(':claimId/pix-key')
  async confirm(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() body: ConfirmClaimBody,
  ) {
    const claim = await this.claim.confirm(claimId, body.pixKey)
    return {
      status: claim.status,
      amount: claim.amountCents.toString(),
    }
  }
}
