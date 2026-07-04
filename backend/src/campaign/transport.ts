import {
  IsArray,
  IsDate,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
  ValidateIf,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer'

import { CampaignDraft, TransferType } from './campaign'
import { BatchDraft, Recipient, Channel } from './batch'

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

export class BatchDto {
  @Type(() => Date)
  @IsDate()
  linksExpireAt: Date

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[]

  toCommand(): BatchDraft {
    return {
      linksExpireAt: this.linksExpireAt,
      recipients: this.recipients.map(r => r.toDomain()),
    }
  }
}

export class CampaignBody {
  @IsUUID()
  accountId: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  message: string

  @IsIn(['pix'])
  transferType?: TransferType

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchDto)
  batches: BatchDto[]

  toCommand(): CampaignDraft {
    return {
      accountId: this.accountId,
      name: this.name,
      message: this.message,
      transferType: this.transferType,
      batches: this.batches.map(b => b.toCommand()),
    }
  }
}