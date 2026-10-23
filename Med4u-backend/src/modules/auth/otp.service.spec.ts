import { ServiceUnavailableException } from '@nestjs/common';
import { OtpService } from './otp.service';

describe('OtpService delivery safety', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuses patient OTP requests when no SMS provider exists without logging the phone or code', async () => {
    const redis = {
      ttl: jest.fn(),
      incr: jest.fn(),
      pipeline: jest.fn(),
    };
    const config = { get: jest.fn((key: string) => key === 'NODE_ENV' ? 'development' : undefined) };
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new OtpService(redis as never, config as never);
    service.onModuleInit();

    await expect(service.sendOtp('+919999999999')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.pipeline).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
