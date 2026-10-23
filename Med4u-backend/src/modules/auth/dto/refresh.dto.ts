import { z } from 'zod';

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;
