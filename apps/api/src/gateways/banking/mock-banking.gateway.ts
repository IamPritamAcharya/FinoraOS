import { Injectable } from '@nestjs/common';
import type { BankingGateway } from './banking.gateway.js';
@Injectable()
export class MockBankingGateway implements BankingGateway {
  async getStatementTransactions() {
    return [];
  }
}
