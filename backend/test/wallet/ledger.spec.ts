import { Ledger, Transaction } from '../../src/wallet/domain/ledger'

describe('Ledger — timeline da campanha (tabela completa)', () => {
    // helper: soma de TODAS as contas tem que ser sempre 0 (mundo fechado)
    const totalSystem = (ledger: Ledger, accounts: string[]) =>
        accounts.reduce((s, acc) => s + ledger.balanceOf(acc as any), 0n)

    const ACCOUNTS = ['external', 'available', 'reserved', 'revenue']

    it('reproduz os 5 passos e bate saldo conta a conta', () => {
       const ledger = new Ledger()

        // passo 1: empresa põe R$200 (external -200, disponivel +200)
        ledger.fund(20000n)

        expect(ledger.balanceOf('external')).toBe(-20000n)
        expect(ledger.balanceOf('available')).toBe(20000n)
        expect(totalSystem(ledger, ACCOUNTS)).toBe(0n)

        // passo 2: reserva batch 165 (150 + 15 taxa) → disponivel -165, reservado +165
        ledger.reserve(16500n)
        expect(ledger.balanceOf('available')).toBe(3500n)
        expect(ledger.balanceOf('reserved')).toBe(16500n)
        expect(totalSystem(ledger, ACCOUNTS)).toBe(0n)

        // passo 3: João resgata (50 PIX sai do mundo + 5 taxa vira receita)
        // reservado -55, external +50, receita +5
        ledger.settle(5000n, 500n)
        expect(ledger.balanceOf('external')).toBe(-15000n)
        expect(ledger.balanceOf('reserved')).toBe(11000n)
        expect(ledger.balanceOf('revenue')).toBe(500n)
        expect(totalSystem(ledger, ACCOUNTS)).toBe(0n)

        // passo 4: Maria resgata (mesma estrutura)
        ledger.settle(5000n, 500n)
        expect(ledger.balanceOf('external')).toBe(-10000n)
        expect(ledger.balanceOf('reserved')).toBe(5500n)
        expect(ledger.balanceOf('revenue')).toBe(1000n)
        expect(totalSystem(ledger, ACCOUNTS)).toBe(0n)

        // passo 5: Lucas expira → volta 55 pra disponivel (reserved -55, available +55)
        ledger.expire(5500n)
        expect(ledger.balanceOf('available')).toBe(9000n)
        expect(ledger.balanceOf('reserved')).toBe(0n)
        expect(ledger.balanceOf('revenue')).toBe(1000n)
        expect(ledger.balanceOf('external')).toBe(-10000n)
        expect(totalSystem(ledger, ACCOUNTS)).toBe(0n)
    })
})
describe('Ledger — invariantes', () => {
    it('recusa transação que não soma zero', () => {
        expect(() =>
            Transaction.create({
                id: 'bad',
                type: 'fund',
                timestamp: new Date(),
                entries: [{ account: 'external', value: 100n }],
            }),
        ).toThrow(/Transaction bad is unbalanced: sum 100, should be 0/)
    })

    it('aceita transação balanceada de 3 entries', () => {
        const ledger = Ledger.hydrate({ reserved: 5500n })
        expect(() => ledger.settle(5000n, 500n)).not.toThrow()
    })

    it('é append-only: posts acumulam, não sobrescrevem', () => {
        const ledger = new Ledger()
        ledger.fund(10000n)
        ledger.fund(10000n)
        expect(ledger.balanceOf('available')).toBe(20000n)
    })

    it('conta sem nenhum entry tem saldo zero', () => {
        const ledger = new Ledger()
        expect(ledger.balanceOf('inexistente' as any)).toBe(0n)
    })

    it('não permite reservar um valor maior que o disponivel', () => {
        const ledger = new Ledger()
        ledger.fund(10000n)

        expect(() => ledger.reserve(16500n)).toThrow(
            /would overdraw available funds/,
        )
    })

    it('não permite liberar (expire) um valor maior que o reservado', () => {
        const ledger = Ledger.hydrate({ available: 1000n, reserved: 500n })

        expect(() => ledger.expire(600n)).toThrow(
            /would overdraw reserved funds/,
        )
    })

    it('', () => {
     const ledger = Ledger.hydrate({ available: 3000n, reserved: 2000n })
     expect(ledger.balanceOf('available')).toBe(3000n)
     expect(ledger.balanceOf('reserved')).toBe(2000n)
    })
})

