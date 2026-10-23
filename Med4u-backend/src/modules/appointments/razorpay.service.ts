import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
}

export function verifyHmacSha256(
  payload: string | Buffer,
  secret: string,
  signature: string,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

@Injectable()
export class RazorpayService {
  constructor(private readonly config: ConfigService) {}

  get configuration(): { enabled: boolean; keyId?: string } {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    const webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    return keyId && keySecret && webhookSecret ? { enabled: true, keyId } : { enabled: false };
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    return Boolean(secret && verifyHmacSha256(`${orderId}|${paymentId}`, secret, signature));
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    return Boolean(secret && verifyHmacSha256(rawBody, secret, signature));
  }

  async createOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
    const { keyId, keySecret } = this.requireCredentials();
    const response = await axios.post<RazorpayOrder>(
      'https://api.razorpay.com/v1/orders',
      { amount: amountPaise, currency: 'INR', receipt },
      { auth: { username: keyId, password: keySecret }, timeout: 10000 },
    );
    return response.data;
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    const { keyId, keySecret } = this.requireCredentials();
    const response = await axios.get<RazorpayPayment>(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { auth: { username: keyId, password: keySecret }, timeout: 10000 },
    );
    return response.data;
  }

  async refund(paymentId: string, amountPaise: number): Promise<void> {
    const { keyId, keySecret } = this.requireCredentials();
    await axios.post(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount: amountPaise, speed: 'normal' },
      { auth: { username: keyId, password: keySecret }, timeout: 10000 },
    );
  }

  private requireCredentials(): { keyId: string; keySecret: string } {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret || !this.config.get<string>('RAZORPAY_WEBHOOK_SECRET')) {
      throw new ServiceUnavailableException({
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: 'Online appointment payments are not configured.',
      });
    }
    return { keyId, keySecret };
  }
}
