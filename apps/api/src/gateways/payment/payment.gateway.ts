export interface PaymentGateway {
  getPayments(): Promise<unknown[]>;
  getSettlements(): Promise<unknown[]>;
  getRefunds(): Promise<unknown[]>;
}
