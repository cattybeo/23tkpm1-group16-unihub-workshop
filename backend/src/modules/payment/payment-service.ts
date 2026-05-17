import CircuitBreaker from 'opossum';
import { MockPaymentGateway } from './mock-payment-gateway.ts';
import { supabaseAdmin } from '../../infra/supabase.ts';

export class PaymentService {
  private breaker: CircuitBreaker;
  private gateway: MockPaymentGateway;

  constructor() {
    this.gateway = new MockPaymentGateway();
    
    const options = {
      timeout: 3000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    };

    this.breaker = new CircuitBreaker(this.gateway.charge.bind(this.gateway), options);

    this.breaker.on('open', () => console.log('⚠️ [Circuit Breaker] OPEN - Cổng thanh toán tạm ngắt'));
    this.breaker.on('halfOpen', () => console.log('🔍 [Circuit Breaker] HALF_OPEN - Thử nghiệm lại'));
    this.breaker.on('close', () => console.log('✅ [Circuit Breaker] CLOSED - Hoạt động bình thường'));
  }

  async processPayment(registrationId: string, amount: number, cardNumber: string) {
    try {
      const result = await this.breaker.fire(amount, cardNumber);

      await supabaseAdmin
        .from('registrations')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', registrationId);

      return result;
    } catch (err: any) {
      if (this.breaker.opened) {
        throw { 
          status: 503, 
          code: 'PAYMENT_UNAVAILABLE', 
          message: 'Thanh toán tạm thời không khả dụng. Chỗ ngồi được giữ 15p, vui lòng thử lại sau.' 
        };
      }
      
      throw err;
    }
  }
}