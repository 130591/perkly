import { createHash, randomBytes } from 'crypto'

// Reaproveitada por ativação/convite/reset (RFC 0004, Decisão 7) — mecanismo
// compartilhado, domínio separado.
export class Token {
  static generate(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('hex')
    return { token, tokenHash: Token.hash(token) }
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
