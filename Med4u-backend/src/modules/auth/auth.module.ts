import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../../database/entities/user.entity';
import { Session } from '../../database/entities/session.entity';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';
import { DemoAccountGuard } from './demo-account.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, Session]),
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JwtModule is configured with the access-token secret.
    // The refresh-token is signed with a separate secret inside TokenService.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn', '15m'),
        },
      }),
    }),
  ],
  providers: [AuthService, OtpService, TokenService, JwtStrategy, DemoAccountGuard],
  controllers: [AuthController],
  // Export JwtModule + PassportModule so other modules (e.g. SocketModule)
  // that import AuthModule get JwtService without a separate JwtModule import.
  exports: [JwtModule, PassportModule, TokenService],
})
export class AuthModule {}
