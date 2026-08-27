import { afterEach, describe, expect, it, vi } from 'vitest';
import { RazorpayGateway } from './razorpay.gateway.js';

const original = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
};

afterEach(() => {
  process.env.RAZORPAY_KEY_ID = original.keyId;
  process.env.RAZORPAY_KEY_SECRET = original.keySecret;
  vi.unstubAllGlobals();
});

describe('RazorpayGateway', () => {
  it('accepts test credentials and maps minor-unit settlement values safely', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_finora';
    process.env.RAZORPAY_KEY_SECRET = 'sandbox-secret';
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'setl_demo',
              amount: 13590900,
              fees: 245000,
              tax: 44100,
              currency: 'INR',
              status: 'processed',
              utr: 'UTR_DEMO',
              created_at: 1787788800,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const result = await new RazorpayGateway().getSettlements({ count: 25 });

    expect(result[0]).toMatchObject({
      externalId: 'setl_demo',
      amount: '135909.00',
      fees: '2450.00',
      tax: '441.00',
      utr: 'UTR_DEMO',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/settlements?count=25&skip=0'),
      expect.objectContaining({
        headers: { authorization: expect.stringMatching(/^Basic /) },
      }),
    );
  });

  it('rejects live-mode credentials in the V1 sandbox adapter', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_not_allowed';
    process.env.RAZORPAY_KEY_SECRET = 'live-secret';
    await expect(new RazorpayGateway().getPayments()).rejects.toThrow('test-mode credentials');
  });
});
