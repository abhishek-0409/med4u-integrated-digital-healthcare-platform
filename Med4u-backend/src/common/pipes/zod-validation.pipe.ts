import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodType, ZodTypeDef, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: this.formatErrors(result.error),
      });
    }
    return result.data;
  }

  private formatErrors(error: ZodError): Record<string, string[]> {
    return error.issues.reduce<Record<string, string[]>>((acc, issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      (acc[path] ??= []).push(issue.message);
      return acc;
    }, {});
  }
}
