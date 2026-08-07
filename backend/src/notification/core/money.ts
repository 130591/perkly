const CENTS_PER_REAL = 100

/** Formata cents (string, convenção de dinheiro do domínio) pra exibição em BRL. */
export class Money {
  static formatBRL(cents: string): string {
    return (Number(cents) / CENTS_PER_REAL).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }
}
