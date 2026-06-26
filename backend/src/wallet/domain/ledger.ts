
export type Account = 'external' | 'available' | 'reserved' | 'revenue'

export type Entry = {
  account: Account,
  value: bigint
}

export type TransactionProps = {
  id: string,
  entries: Entry[]
  timestamp: Date,
  type: 'fund' | 'reserve' | 'payout' | 'expire',
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
  private journal: Transaction[] = []

  private assertSufficientFunds(tx: Transaction): void {
    const delta = tx.props.entries
      .filter(e => e.account === 'available')
      .reduce((s, e) => s + e.value, 0n)

    if (delta < 0n && this.balanceOf('available') + delta < 0n) {
      throw new Error(`Transaction ${tx.props.id} would overdraw available funds`)
    }
  }

  post(transaction: TransactionProps): Transaction {
    const tx = Transaction.create(transaction)
    this.assertSufficientFunds(tx)
    this.journal.push(tx)
    return tx
  }

  balanceOf(account: Account) {
    return this.journal
      .flatMap(tx => tx.props.entries)
      .filter(e => e.account === account)
      .reduce((sum, e) => sum + e.value, 0n)
  }
    
  static hydrate(transactions: TransactionProps[]): Ledger {
    const ledger = new Ledger()
    for (const props of transactions) {
      ledger.journal.push(Transaction.create(props))
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
}
