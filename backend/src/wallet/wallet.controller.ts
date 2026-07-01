import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator'
import { Wallet } from './service'

/** Amounts travel as strings (cents) so they survive JSON without losing the bigint. */
class CreateChargeBody {
  @IsIn(['pix', 'boleto'], {
    message: 'method must be either "pix" or "boleto".',
  })
  method: 'pix' | 'boleto'

  @IsNotEmpty({ message: 'amount is required.' })
  @Matches(/^[1-9]\d*$/, {
    message: 'amount must be an amount in cents: a positive integer with no leading zeros or separators.',
  })
  amount: string

  @IsString({ message: 'idempotencyKey must be a string.' })
  @IsNotEmpty({ message: 'idempotencyKey is required.' })
  idempotencyKey: string
}

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: Wallet) {}

  /**
   * Opens a PSP charge so the customer can top up their wallet. Synchronous,
   * customer-facing: returns the payment instructions (e.g. the pix QR code).
   *
   * Settlement is NOT handled here — `confirmBalance` runs as an async job once
   * the PSP notifies payment, so it is intentionally not exposed as an endpoint.
   */
  @Post(':accountId/charge')
  async createCharge(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: CreateChargeBody,
  ) {
    const charge = await this.wallet.addBalance({
      accountId,
      method: body.method,
      amount: BigInt(body.amount),
      idempotencyKey: body.idempotencyKey,
    })

    const instrument =
      charge.method === 'pix'
        ? { pixQrCode: charge.pixQrCode }
        : { boletoLine: charge.boletoLine }

    return {
      id: charge.id,
      status: charge.status,
      amount: charge.amountCents.toString(),
      ...instrument,
      expiresAt: charge.expiresAt,
    }
  }

  /**
   * Read-model with the customer's wallet balances (available, reserved, total).
   * Ledger is the source of truth; amounts are cents-as-strings to survive JSON.
   */
  @Get(':accountId/balance')
  async getBalances(@Param('accountId', ParseUUIDPipe) accountId: string) {
    return this.wallet.findBalances(accountId)
  }
}
