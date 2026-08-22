import { Injectable } from '@nestjs/common';
import type { PaymentGateway } from './payment.gateway.js';
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  async getPayments() {
    return [];
  }
  async getSettlements() {
    return [];
  }
  async getRefunds() {
    return [];
  }
}
