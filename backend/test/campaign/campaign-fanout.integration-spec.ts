import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { SqsService } from '@ssut/nestjs-sqs'
import { useIntegrationApp } from '../wallet/setup'
import { CampaignFanoutWorker } from '../../src/campaign/campaign-fanout.worker'
import { CampaignRepository } from '../../src/campaign/repository'
import {
  CampaignEntity,
  BatchEntity,
} from '../../src/campaign/campaign.entity'
import { parsePayoutBatchRequested } from '../../src/campaign/campaign-events.codec'
import { PAYOUT_BATCH_QUEUE } from '../../src/campaign/queues'

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000)

type SeedBatch = {
  linksExpireAt?: Date
  recipients: { name: string; amountCents: string }[]
}

/** Semeia uma campanha já `active` e sem fan-out — o estado que o worker varre. */
async function seedActiveCampaign(ds: DataSource, batches: SeedBatch[]) {
  return ds.getRepository(CampaignEntity).save(
    new CampaignEntity({
      accountId: randomUUID(),
      name: 'NPS',
      message: 'obrigado',
      transferType: 'pix',
      status: 'active',
      fannedOutAt: null,
      batches: batches.map(
        (batch) =>
          new BatchEntity({
            linksExpireAt: batch.linksExpireAt ?? FUTURE,
            recipients: batch.recipients.map((r) => ({
              name: r.name,
              amountCents: r.amountCents,
              channel: { type: 'email', address: `${r.name}@ex.com` },
            })),
          }),
      ),
    }),
  )
}

const recipients = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `r${i}`, amountCents: '1000' }))

describe('CampaignFanoutWorker', () => {
  const ctx = useIntegrationApp()

  // Não há ElasticMQ no teste de integração (só Postgres via Testcontainers).
  // O foco é o gatilho por varredura + a marca `fanned_out_at`, não o transporte:
  // interceptamos o envio e inspecionamos os payloads.
  let sendSpy: jest.SpyInstance

  beforeEach(() => {
    sendSpy = jest
      .spyOn(SqsService.prototype, 'send')
      .mockResolvedValue(undefined as never)
  })

  afterEach(() => jest.restoreAllMocks())

  const reload = (ds: DataSource, id: number) =>
    ds.getRepository(CampaignEntity).findOneByOrFail({ id })

  // O 2º arg de `send` é `Message | Message[]`; aqui é sempre a mensagem única
  // que o worker envia. Decodifica o body pro evento tipado.
  const pageOf = (call: unknown[]) =>
    parsePayoutBatchRequested((call[1] as { body: string }).body)

  it('pagina a campanha ativa e marca fanned_out_at', async () => {
    const worker = ctx.get(CampaignFanoutWorker)
    const campaign = await seedActiveCampaign(ctx.ds, [
      { recipients: recipients(3) },
    ])

    await worker.drain()

    // uma página publicada, na fila de payout, com os 3 recipients
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe(PAYOUT_BATCH_QUEUE)
    const page = pageOf(sendSpy.mock.calls[0])
    expect(page.campaignId).toBe(campaign.externalId)
    expect(page.pageId).toBe(`${campaign.batches[0].externalId}:0`)
    expect(page.recipients).toHaveLength(3)

    // a linha deixou de ser candidata: fan-out concluído
    const persisted = await reload(ctx.ds, campaign.id)
    expect(persisted.fannedOutAt).not.toBeNull()
  })

  it('emite uma página por batch, com pageId ancorado no batch', async () => {
    const worker = ctx.get(CampaignFanoutWorker)
    const campaign = await seedActiveCampaign(ctx.ds, [
      { recipients: recipients(1) },
      { recipients: recipients(1) },
    ])

    await worker.drain()

    expect(sendSpy).toHaveBeenCalledTimes(2)
    const pageIds = sendSpy.mock.calls.map((call) => pageOf(call).pageId).sort()
    const expected = campaign.batches.map((b) => `${b.externalId}:0`).sort()
    expect(pageIds).toEqual(expected)
  })

  it('não republica uma campanha já fan-outed (varredura repetida é no-op)', async () => {
    const worker = ctx.get(CampaignFanoutWorker)
    await seedActiveCampaign(ctx.ds, [{ recipients: recipients(2) }])

    await worker.drain()
    expect(sendSpy).toHaveBeenCalledTimes(1)

    sendSpy.mockClear()
    await worker.drain()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('ignora campanhas em draft (só ativa entra na varredura)', async () => {
    const worker = ctx.get(CampaignFanoutWorker)
    const campaign = await seedActiveCampaign(ctx.ds, [
      { recipients: recipients(1) },
    ])
    await ctx.ds
      .getRepository(CampaignEntity)
      .update(campaign.id, { status: 'draft' })

    await worker.drain()

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('crash-safety: falha ao marcar → rollback → campanha reprocessada, não zumbi', async () => {
    const worker = ctx.get(CampaignFanoutWorker)
    const repo = ctx.get(CampaignRepository)
    const campaign = await seedActiveCampaign(ctx.ds, [
      { recipients: recipients(1) },
    ])

    // Simula queda entre publicar as páginas e commitar a marca: o `send` já
    // ocorreu, mas `markFannedOut` estoura → a tx inteira dá rollback.
    const markSpy = jest
      .spyOn(repo, 'markFannedOut')
      .mockRejectedValueOnce(new Error('db down'))

    await expect(worker.dispatchNext()).rejects.toThrow('db down')

    // a página foi enviada, mas a marca NÃO foi persistida (rollback)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect((await reload(ctx.ds, campaign.id)).fannedOutAt).toBeNull()

    // markFannedOut volta ao normal (mockRejectedValueOnce só pega a 1ª); a
    // próxima varredura repega a campanha e reenvia a mesma página (idempotente
    // por pageId no payout) — a campanha nunca fica encalhada.
    await worker.drain()

    expect(markSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(pageOf(sendSpy.mock.calls[1]).pageId).toBe(
      pageOf(sendSpy.mock.calls[0]).pageId,
    )
    expect((await reload(ctx.ds, campaign.id)).fannedOutAt).not.toBeNull()
  })
})
