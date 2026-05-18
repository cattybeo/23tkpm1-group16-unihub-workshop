// Ports & Adapters: payment module interfaces (ports)
// Adapters live in infra/payment/

export interface IPaymentGateway {
  charge(amount: number, ref: string): Promise<{ gateway_ref: string }>
}

export class PaymentBusinessError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PaymentBusinessError' }
}

export class PaymentUnavailableError extends Error {
  constructor() { super('Payment gateway unavailable'); this.name = 'PaymentUnavailableError' }
}

export interface PaymentResult {
  payment_id:  string
  status:      'paid' | 'failed'
  gateway_ref: string | null
  qr_token:    string
  qr_image:    string
}
