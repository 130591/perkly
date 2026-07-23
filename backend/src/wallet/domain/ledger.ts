export type Account = 'external' | 'available' | 'reserved' | 'revenue'
const ACCOUNTS = ['external', 'available', 'reserved', 'revenue'] as const
    
export type Entry = {
  account: Account,
  value: bigint
}

export type Snapshot = Partial<Record<Account, bigint>>

export type TransactionProps = {
  id: string,
  entries: Entry[]
  timestamp: Date,
  type: 'fund' | 'reserve' | 'settle' | 'expire',
}

export class Transaction {
  private constructor(
    readonly props: TransactionProps
) {}
    
  static create (props: TransactionProps) {
    this.assertBalanced(props)
    return new Transaction(props)
  }

  private static assertBalanced (transaction: TransactionProps) {
    const sum = transaction.entries
      .reduce((s, e) => s + e.value, 0n)
    
    if (sum !== 0n) {
      throw new Error(
        `Transaction ${transaction.id} is unbalanced: sum ${sum}, should be 0`)
    }
  }
}

export class Ledger {
  private balances = new Map<Account, bigint>()

  // 'external' representa o mundo fora do sistema — é feito pra ir negativo
  // (dinheiro entrando). 'revenue' ninguém debita ainda. Só available/reserved
  // têm piso: nenhuma operação pode tirar deles mais do que existe.
  private static readonly GUARDED_ACCOUNTS: readonly Account[] = ['available', 'reserved']

  private assertSufficientFunds(tx: Transaction): void {
    for (const account of Ledger.GUARDED_ACCOUNTS) {
      const delta = tx.props.entries
        .filter(e => e.account === account)
        .reduce((s, e) => s + e.value, 0n)

      if (delta < 0n && this.balanceOf(account) + delta < 0n) {
        throw new Error(`Transaction ${tx.props.id} would overdraw ${account} funds`)
      }
    }
  }

  private post(transaction: TransactionProps): Transaction {
    const tx = Transaction.create(transaction)
    this.assertSufficientFunds(tx)
    for (const entry of tx.props.entries) {
      const current = this.balances.get(entry.account) ?? 0n
      this.balances.set(entry.account, current + entry.value)
    }
    return tx
  }

  summary() {
    const available = this.balanceOf('available') ?? 0n
    const reserved =  this.balanceOf('reserved') ?? 0n
    const total = available + reserved

    return {
      available:available.toString(),
      reserved: reserved.toString(),
      total: total.toString()
    }
  }

  balanceOf(account: Account) {
    return this.balances.get(account) ?? 0n
  }
    
  static hydrate(snapshot: Snapshot): Ledger {
    const ledger = new Ledger()
    for (const account of ACCOUNTS) {
      const balance = snapshot[account]
      if (balance !== undefined) ledger.balances.set(account, balance)
    }
    return ledger
  }
    
  private record(
    type: TransactionProps['type'],
    entries: Entry[],
    at: Date,
  ): Transaction {
    return this.post({ id: crypto.randomUUID(), timestamp: at, type, entries })
  }

  fund(amount: bigint, at: Date = new Date()): Transaction {
    return this.record('fund', [
      { account: 'external', value: -amount },
      { account: 'available', value: amount }
    ], at)
  }

  reserve(amount: bigint, at: Date = new Date()): Transaction {
    return this.record('reserve', [
      { account: 'available', value: -amount },
      { account: 'reserved', value: amount }
    ], at)
  }

  settle(amount: bigint, fee: bigint, at: Date = new Date()): Transaction {
    return this.record('settle', [
      { account: 'reserved', value: -(amount + fee) },
      { account: 'external', value: amount },
      { account: 'revenue', value: fee }
    ], at)
  }

  expire(amount: bigint, at: Date = new Date()): Transaction {
    return this.record('expire', [
      { account: 'reserved', value: -amount },
      { account: 'available', value: amount }
    ], at)
  }
}
