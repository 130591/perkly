import { Charge, ChargeStatus, OpenCharge, PaymentRail } from './payment-rail'
import { CelcoinConfig } from '../wallet/config/celcoin.config'

/**
 * CelcoinPaymentRail — implementação real da porta `PaymentRail` sobre a linha
 * cel_banking/BaaS da Celcoin (`openfinance.celcoin.dev`). Ver docs/integration.md.
 *
 * PRELIMINAR: cobre só o cash-in pix (Fluxo A — `POST /pix/v1/brcode/dynamic`).
 * Pendências marcadas com TODO: mTLS + IP allowlist em produção, boleto, retry/
 * backoff, dedupe de webhook, conciliação. Não está fiado no DI ainda (falta
 * credencial) — o `SettleModule` segue com o `Psp` mock como `PAYMENT_RAIL`.
 *
 * `normalize*()` são a ÚNICA fronteira que conhece as duas convenções: outward
 * (resposta Celcoin snake_case/enum → `Charge` camelCase) e inward (`OpenCharge`
 * → request Celcoin). Nada fora deste arquivo fala "Celcoin".
 */

type CelcoinToken = { accessToken: string; expiresAt: number }

type CelcoinTokenResponse = { access_token: string; expires_in: number }

type CelcoinBrcodeResponse = {
  status: string
  transactionId: number
  clientRequestId: string
  location: { emv: string; locationId: string }
}

const CENTS_PER_REAL = 100

export class CelcoinPaymentRail implements PaymentRail {
  private token?: CelcoinToken

  constructor(private readonly config: CelcoinConfig) {}

  async charge(input: OpenCharge): Promise<Charge> {
    if (input.method !== 'pix') {
      // TODO: boleto não é atendido pela linha BaaS usada aqui.
      throw new Error(`Celcoin rail: unsupported method ${input.method}`)
    }

    const expiration = input.expiresInSeconds ?? 3600
    const res = (await this.post('/pix/v1/brcode/dynamic', {
      clientRequestId: input.reference,
      key: this.config.pixKey,
      amount: { original: this.centsToReais(input.amountCents) },
      calendar: { expiration },
    })) as CelcoinBrcodeResponse

    return this.normalizeCharge(res, input, expiration)
  }

  // —— normalize (outward): resposta Celcoin → Charge de domínio ————————————————
  private normalizeCharge(
    res: CelcoinBrcodeResponse,
    input: OpenCharge,
    expiration: number,
  ): Charge {
    return {
      id: String(res.transactionId),
      // Credita pelo valor pedido; o valor CONFIRMADO vem depois no webhook
      // pix-payment-in e é ele que deve lastrear o fund() (ver integration.md §3.3).
      amountCents: input.amountCents,
      status: this.normalizeStatus(res.status),
      method: 'pix',
      pixQrCode: res.location.emv,
      expiresAt: new Date(Date.now() + expiration * 1000),
    }
  }

  /** Fan-in muitos→poucos: enum de status da Celcoin → `ChargeStatus` do domínio. */
  private normalizeStatus(celcoin: string): ChargeStatus {
    switch (celcoin) {
      case 'ACTIVE':
      case 'PROCESSING':
        return 'pending'
      case 'CONFIRMED':
      case 'COMPLETED':
        return 'paid'
      case 'REMOVED_BY_RECEIVING_USER':
      case 'REMOVED_BY_PSP':
        return 'expired'
      default:
        return 'failed'
    }
  }

  // —— conversão reais↔cents: só cruza aqui, na borda (integration.md §Ressalvas) ——
  private centsToReais(cents: bigint): number {
    return Number(cents) / CENTS_PER_REAL
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.authenticate()
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Celcoin ${path} failed: ${res.status} ${await res.text()}`)
    }
    return res.json()
  }

  /** Token com cache + refresh proativo (margem de 60s antes do `expires_in`). */
  private async authenticate(): Promise<string> {
    const now = Date.now()
    if (this.token && this.token.expiresAt - 60_000 > now) {
      return this.token.accessToken
    }

    // TODO: produção exige mTLS (.crt/.key) + IP allowlist.
    const res = await fetch(`${this.config.baseUrl}/v5/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    })
    if (!res.ok) {
      throw new Error(`Celcoin auth failed: ${res.status}`)
    }

    const json = (await res.json()) as CelcoinTokenResponse
    this.token = {
      accessToken: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    }
    return this.token.accessToken
  }
}
