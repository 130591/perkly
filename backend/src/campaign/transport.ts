import {
  IsArray,
  IsDate,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
  ValidateIf,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer'

import {
  CampaignDraft,
  Recipient,
  Channel,
  TransferType,
} from './campaign'

export class ChannelDto {
  @IsIn(['email', 'phone'])
  type: 'email' | 'phone'

  @ValidateIf(c => c.type === 'email')
  @IsEmail({}, { message: 'address must be a valid email.' })
  address?: string

  @ValidateIf(c => c.type === 'phone')
  @IsString()
  @IsNotEmpty()
  number?: string

  toDomain(): Channel {
    if (this.type === 'email') {
      return {
        type: 'email',
        address: this.address!,
      }
    }

    return {
      type: 'phone',
      number: this.number!,
    }
  }
}

export class RecipientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumberString()
  amountCents: string;

  @ValidateNested()
  @Type(() => ChannelDto)
  channel: ChannelDto;

  toDomain(): Recipient {
    return {
      name: this.name,
      amountCents: BigInt(this.amountCents),
      channel: this.channel.toDomain(),
    }
  }
}

export class CampaignBody {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  message: string

  @IsIn(['pix'])
  transferType?: TransferType

  @Type(() => Date)
  @IsDate()
  linksExpireAt: Date

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[]

  toCommand(): CampaignDraft {
    return {
      name: this.name,
      message: this.message,
      transferType: this.transferType,
      linksExpireAt: this.linksExpireAt,
      recipients: this.recipients.map(r => r.toDomain()),
    }
  }
}