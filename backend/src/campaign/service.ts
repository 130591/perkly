import { Injectable } from '@nestjs/common'
import { CampaignRepository } from './repository'
import { Campaign, CampaignDraft } from './campaign'

@Injectable()
export class CampaignService {
  constructor(private readonly repository: CampaignRepository) {}

  async create(command: CampaignDraft) {
    const campaign = Campaign.draft(command)
    const saved = await this.repository.create(campaign)
    return { id: saved.externalId, status: saved.status }
  }
}
