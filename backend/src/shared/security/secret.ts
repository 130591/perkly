import { timingSafeEqual } from 'crypto'

// Comparação de segredos estáticos (backoffice token, webhook secret): `!==`
// de string compara byte a byte e para no primeiro mismatch, vazando por
// timing quanto do prefixo já bateu. `timingSafeEqual` exige buffers do mesmo
// tamanho, então o length-check abaixo tem que vir antes dele.
export class Secret {
  static matches(provided: unknown, expected: string): boolean {
    if (typeof provided !== 'string') return false

    const providedBuffer = Buffer.from(provided)
    const expectedBuffer = Buffer.from(expected)
    if (providedBuffer.length !== expectedBuffer.length) return false

    return timingSafeEqual(providedBuffer, expectedBuffer)
  }
}
