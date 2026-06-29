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

  private assertSufficientFunds(tx: Transaction): void {
    const delta = tx.props.entries
      .filter(e => e.account === 'available')
      .reduce((s, e) => s + e.value, 0n)

    if (delta < 0n && this.balanceOf('available') + delta < 0n) {
      throw new Error(`Transaction ${tx.props.id} would overdraw available funds`)
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
    
  fund(amount: bigint, at: Date = new Date): Transaction {
    return this.post({
      id: crypto.randomUUID(), 
      timestamp: at, 
      type: 'fund', 
      entries: [
        { account: 'external', value: -amount },
        { account: 'available', value: amount }
      ]
    })
  }
    
  reserve(amount: bigint, at: Date = new Date): Transaction {
    return this.post({
      id: crypto.randomUUID(),
      timestamp: at,
      type: 'reserve',
      entries: [
        { account: 'available', value: -amount },
        { account: 'reserved', value: amount }
      ]
    })
  }

  settle(amount: bigint, fee: bigint, at: Date = new Date): Transaction {
    return this.post({
      id: crypto.randomUUID(),
      timestamp: at,
      type: 'settle',
      entries: [
        { account: 'reserved', value: -(amount + fee) },
        { account: 'external', value: amount },
        { account: 'revenue', value: fee }
      ]
    })
  }

  expire(amount: bigint, at: Date = new Date): Transaction {
    return this.post({
      id: crypto.randomUUID(),
      timestamp: at,
      type: 'expire',
      entries: [
        { account: 'reserved', value: -amount },
        { account: 'available', value: amount }
      ]
    })
  }
}
