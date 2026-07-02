import { z } from 'zod'

export const databaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().positive().default(5432),
  user: z.string().default('postgres'),
  password: z.string().default('postgres'),
  name: z.string().default('perkly'),
  // z.coerce.boolean() trata qualquer string não-vazia como true ('false' → true),
  // então casamos a semântica `=== 'true'` do app.module explicitamente.
  synchronize: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>
