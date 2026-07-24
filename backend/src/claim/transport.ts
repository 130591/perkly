import { IsNotEmpty, IsString } from 'class-validator'

export class ConfirmClaimBody {
  @IsString({ message: 'pixKey must be a string.' })
  @IsNotEmpty({ message: 'pixKey is required.' })
  pixKey: string
}
