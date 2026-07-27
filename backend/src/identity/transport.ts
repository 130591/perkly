import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator'

export class NewTenantBody {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  companyName: string

  @Matches(/^\d{14}$/, { message: 'cnpj must be 14 digits' })
  cnpj: string

  @Matches(/^\d{10,11}$/, {
    message:
      'companyPhone must be 10 or 11 digits (DDD + number, no punctuation)',
  })
  companyPhone: string
}
