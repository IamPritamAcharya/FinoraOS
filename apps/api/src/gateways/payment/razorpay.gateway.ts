import { Injectable } from '@nestjs/common';
import type { PaymentGateway } from './payment.gateway.js';
@Injectable()
export class RazorpayGateway implements PaymentGateway {
  private unavailable(): never {
    throw new Error('Razorpay sandbox credentials are not configured.');
  }
  async getPayments() {
    return this.unavailable();
  }
  async getSettlements() {
    return this.unavailable();
  }
  async getRefunds() {
    return this.unavailable();
  }
}
