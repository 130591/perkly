import * as argon2 from 'argon2'

// Argon2id, não SHA-256 (Token) — senha é segredo de baixa entropia escolhido
// por humano, precisa resistir a força bruta offline (RFC 0004, Decisão 15).
export class Password {
  static hash(password: string): Promise<string> {
    return argon2.hash(password)
  }

  static verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password)
  }
}
