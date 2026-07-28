import { IsEmail, IsIn, IsNotEmpty, IsString, Matches } from 'class-validator'
import { UserRole } from './database'

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

export class LoginBody {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
}

export class InviteMemberBody {
  @IsEmail()
  email: string

  @IsIn(['ADMIN', 'MEMBER'] satisfies UserRole[])
  role: UserRole
}

export class AcceptInvitationBody {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  password: string
}
