export type GatewayQuery = { from?: Date; to?: Date; count?: number; skip?: number };

export type GatewayPayment = {
  externalId: string;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
  orderId?: string;
  invoiceId?: string;
  email?: string;
  contact?: string;
  raw: unknown;
};

export type GatewaySettlement = {
  externalId: string;
  amount: string;
  fees: string;
  tax: string;
  currency: string;
  status: string;
  utr?: string;
  createdAt: string;
  raw: unknown;
};

export type GatewayRefund = {
  externalId: string;
  paymentId: string;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
  raw: unknown;
};

export interface PaymentGateway {
  getPayments(query?: GatewayQuery): Promise<GatewayPayment[]>;
  getSettlements(query?: GatewayQuery): Promise<GatewaySettlement[]>;
  getRefunds(query?: GatewayQuery): Promise<GatewayRefund[]>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
