import { Module } from '@nestjs/common';
import { MockPaymentGateway } from './mock-payment.gateway.js';
import { PAYMENT_GATEWAY } from './payment.gateway.js';
import { RazorpayGateway } from './razorpay.gateway.js';

@Module({
  providers: [
    MockPaymentGateway,
    RazorpayGateway,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (mock: MockPaymentGateway, razorpay: RazorpayGateway) =>
        process.env.PAYMENT_PROVIDER === 'razorpay' ? razorpay : mock,
      inject: [MockPaymentGateway, RazorpayGateway],
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentGatewayModule {}
