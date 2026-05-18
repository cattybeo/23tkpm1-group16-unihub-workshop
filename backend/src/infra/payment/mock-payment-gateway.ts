import type { IPaymentGateway } from '../../modules/payment/types.js'
import { PaymentBusinessError } from '../../modules/payment/types.js'

// Adapter: mock payment gateway for development/testing
export class MockPaymentGateway implements IPaymentGateway {
  async charge(_amount: number, ref: string): Promise<{ gateway_ref: string }> {
    // Simulate latency 50–400ms
    await new Promise(r => setTimeout(r, 50 + Math.random() * 350))

    // 5% chance of gateway error (trips circuit breaker)
    if (Math.random() < 0.05) throw new Error('Gateway internal error 500')

    // 2% business failure (card declined — does NOT trip CB)
    if (Math.random() < 0.02) {
      throw new PaymentBusinessError('Card declined')
    }

    return { gateway_ref: `mock_${ref}_${Date.now()}` }
  }
}
