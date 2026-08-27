import { Injectable } from '@nestjs/common';
import type {
  GatewayPayment,
  GatewayQuery,
  GatewayRefund,
  GatewaySettlement,
  PaymentGateway,
} from './payment.gateway.js';

type RazorpayCollection = {
  items?: Array<Record<string, unknown>>;
  error?: { description?: string };
};

const majorAmount = (value: unknown) => {
  const minor = BigInt(typeof value === 'number' || typeof value === 'string' ? value : 0);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const optionalText = (value: unknown) => (typeof value === 'string' ? value : undefined);
const timestamp = (value: unknown) =>
  new Date((typeof value === 'number' ? value : Number(value ?? 0)) * 1000).toISOString();

@Injectable()
export class RazorpayGateway implements PaymentGateway {
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  private credentials() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay sandbox credentials are not configured.');
    if (!keyId.startsWith('rzp_test_')) {
      throw new Error('FinoraOS V1 accepts Razorpay test-mode credentials only.');
    }
    return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  private async collection(path: string, query: GatewayQuery = {}) {
    const params = new URLSearchParams({
      count: String(Math.min(query.count ?? 100, 100)),
      skip: String(Math.max(query.skip ?? 0, 0)),
    });
    if (query.from) params.set('from', String(Math.floor(query.from.getTime() / 1000)));
    if (query.to) params.set('to', String(Math.floor(query.to.getTime() / 1000)));
    const response = await fetch(`${this.baseUrl}/${path}?${params}`, {
      headers: { authorization: `Basic ${this.credentials()}` },
    });
    const body = (await response.json()) as RazorpayCollection;
    if (!response.ok) {
      throw new Error(body.error?.description ?? `Razorpay returned HTTP ${response.status}.`);
    }
    return body.items ?? [];
  }

  async getPayments(query?: GatewayQuery): Promise<GatewayPayment[]> {
    return (await this.collection('payments', query)).map((item) => ({
      externalId: text(item.id),
      amount: majorAmount(item.amount),
      currency: text(item.currency),
      status: text(item.status),
      createdAt: timestamp(item.created_at),
      orderId: optionalText(item.order_id),
      invoiceId: optionalText(item.invoice_id),
      email: optionalText(item.email),
      contact: optionalText(item.contact),
      raw: item,
    }));
  }

  async getSettlements(query?: GatewayQuery): Promise<GatewaySettlement[]> {
    return (await this.collection('settlements', query)).map((item) => ({
      externalId: text(item.id),
      amount: majorAmount(item.amount),
      fees: majorAmount(item.fees),
      tax: majorAmount(item.tax),
      currency: text(item.currency),
      status: text(item.status),
      utr: optionalText(item.utr),
      createdAt: timestamp(item.created_at),
      raw: item,
    }));
  }

  async getRefunds(query?: GatewayQuery): Promise<GatewayRefund[]> {
    return (await this.collection('refunds', query)).map((item) => ({
      externalId: text(item.id),
      paymentId: text(item.payment_id),
      amount: majorAmount(item.amount),
      currency: text(item.currency),
      status: text(item.status),
      createdAt: timestamp(item.created_at),
      raw: item,
    }));
  }
}
