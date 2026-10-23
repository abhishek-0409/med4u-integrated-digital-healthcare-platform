import { createHmac } from 'crypto';
import { RazorpayService, verifyHmacSha256 } from './razorpay.service';
import { AppointmentService } from './appointment.service';

describe('Razorpay payment verification', () => {
  const secret = 'test-secret-that-is-not-a-real-provider-key';
  const signatureFor = (payload: string) =>
    createHmac('sha256', secret).update(payload).digest('hex');

  it('validates checkout signatures over the provider order/payment pair', () => {
    const payload = 'order_test_123|pay_test_456';
    expect(verifyHmacSha256(payload, secret, signatureFor(payload))).toBe(true);
    expect(verifyHmacSha256(`${payload}x`, secret, signatureFor(payload))).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifyHmacSha256('payload', secret, 'not-a-signature')).toBe(false);
    expect(verifyHmacSha256('payload', secret, 'a'.repeat(63))).toBe(false);
  });

  it('keeps checkout disabled when provider credentials are missing', () => {
    const service = new RazorpayService({ get: () => undefined } as never);
    expect(service.configuration).toEqual({ enabled: false });
    expect(service.verifyCheckoutSignature('order', 'payment', signatureFor('order|payment'))).toBe(
      false,
    );
  });

  it('does not reserve or confirm an appointment when payment is unconfigured', async () => {
    const razorpay = new RazorpayService({ get: () => undefined } as never);
    const appointments = new AppointmentService({} as never, {} as never, {} as never, razorpay);
    await expect(
      appointments.createPaymentOrder('patient-id', {
        doctorId: 'doctor-id',
        slotId: 'slot-id',
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENTS_NOT_CONFIGURED' },
      status: 503,
    });
  });
});
