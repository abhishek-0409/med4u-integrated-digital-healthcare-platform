import { ApiProperty } from '@nestjs/swagger';

/** Shape returned by POST /v1/consultations/:appointmentId/join */
export class StunServerDto {
  @ApiProperty({ example: 'stun:stun.l.google.com:19302' })
  urls!: string;
}

export class TurnServerDto {
  @ApiProperty({ example: 'turn:your-turn-server.com:3478' })
  urls!: string;

  @ApiProperty({ example: 'med4u' })
  username!: string;

  @ApiProperty({ example: 'your-credential' })
  credential!: string;
}

export class JoinConsultationResponseDto {
  @ApiProperty({ description: 'Socket.IO room ID (equals appointmentId)' })
  roomId!: string;

  @ApiProperty({ description: 'Short-lived JWT for this consultation room (2 hr expiry)' })
  token!: string;

  @ApiProperty({ type: [StunServerDto] })
  stunServers!: StunServerDto[];

  @ApiProperty({ type: [TurnServerDto] })
  turnServers!: TurnServerDto[];
}

/** Shape returned by GET /v1/consultations/:appointmentId/status */
export class ConsultationStatusDto {
  @ApiProperty({ enum: ['waiting', 'connecting', 'connected', 'ended'] })
  status!: 'waiting' | 'connecting' | 'connected' | 'ended';

  @ApiProperty({ example: 1 })
  participants!: number;

  @ApiProperty({ example: '2026-05-03T10:00:00.000Z', nullable: true })
  startedAt!: string | null;
}
