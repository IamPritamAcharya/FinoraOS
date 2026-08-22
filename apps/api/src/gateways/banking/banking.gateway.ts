export interface BankingGateway {
  getStatementTransactions(): Promise<unknown[]>;
}
