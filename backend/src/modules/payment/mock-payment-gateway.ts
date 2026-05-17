export class MockPaymentGateway {
  async charge(amount: number, cardNumber: string) {
    return new Promise((resolve, reject) => {
      const delay = Math.random() * 2000; 

      setTimeout(() => {
        if (cardNumber === '404') {
          return reject({ status: 400, code: 'INVALID_CARD', message: 'Thẻ không hợp lệ' });
        }

        if (process.env.PAYMENT_MOCK_FAIL === 'true' || Math.random() > 0.7) {
          return reject({ status: 500, code: 'GATEWAY_DOWN', message: 'Cổng thanh toán sập' });
        }

        resolve({ transaction_id: `TXN-${Date.now()}`, amount });
      }, delay);
    });
  }
}