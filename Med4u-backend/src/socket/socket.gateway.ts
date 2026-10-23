import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { ConsultationService } from '../modules/consultations/consultation.service';
import {
  AuthenticatedSocket,
  SocketAuthMiddleware,
} from './socket.middleware';

// ── Payload interfaces ─────────────────────────────────────────────────────────

interface JoinRoomPayload {
  roomId: string;
}

/** SDP is forwarded opaquely — typed as a plain object to avoid DOM dependency */
interface SdpPayload {
  roomId: string;
  sdp: Record<string, unknown>;
}

interface IceCandidatePayload {
  roomId: string;
  candidate: Record<string, unknown>;
}

interface CallRejectedPayload {
  roomId: string;
  reason: string;
}

// ── Gateway ────────────────────────────────────────────────────────────────────

// CORS is configured once for the whole app via the IoAdapter in main.ts.
@WebSocketGateway()
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(SocketGateway.name);

  /**
   * In-memory map: socketId → { roomId, userId }.
   * Used for automatic leave-room cleanup on disconnect.
   */
  private readonly socketRoom = new Map<
    string,
    { roomId: string; userId: string }
  >();
  private readonly signalWindows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly consultationService: ConsultationService,
    private readonly socketAuthMiddleware: SocketAuthMiddleware,
  ) {}

  // ── Lifecycle hooks ────────────────────────────────────────────────────────

  /** Attach JWT auth middleware to the default namespace after init. */
  afterInit(server: Server): void {
    server.use((socket, next) =>
      this.socketAuthMiddleware.use(socket as AuthenticatedSocket, next),
    );
    this.logger.log('SocketGateway initialised');
  }

  handleConnection(socket: AuthenticatedSocket): void {
    this.logger.debug(`connected  socketId=${socket.id}`);
  }

  /**
   * Auto-trigger leave logic when a socket drops without sending leave-room.
   * Safe to call even when the socket was never in a room.
   */
  handleDisconnect(socket: AuthenticatedSocket): void {
    this.signalWindows.delete(socket.id);
    void this.handleLeave(socket);
  }

  // ── join-room ──────────────────────────────────────────────────────────────

  /**
   * Client joins a consultation room.
   * Enforces: user must be appointment participant, max 2 occupants.
   */
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    const roomId = this.readRoomId(payload);
    const userId = socket.data.user.sub;

    if (!roomId) {
      socket.emit('error', { message: 'Invalid consultation room.' });
      return;
    }
    if (socket.data.consultationRoomId && socket.data.consultationRoomId !== roomId) {
      socket.emit('error', { message: 'Consultation token is scoped to a different appointment.' });
      socket.disconnect(true);
      return;
    }

    if ([...this.socketRoom.values()].some((item) => item.roomId === roomId && item.userId === userId)) {
      socket.emit('error', { message: 'This participant is already connected to the consultation.' });
      socket.disconnect(true);
      return;
    }

    if (this.socketRoom.has(socket.id)) {
      socket.emit('error', { message: 'Already in a room.' });
      return;
    }

    // 1 — Verify the appointment exists and this user belongs to it
    try {
      const appointment = await this.consultationService.requireJoinable(userId, roomId);
      if (appointment.doctor?.userId !== userId && appointment.patientId !== userId) {
        throw new Error('You are not a participant of this appointment.');
      }
    } catch (err) {
      socket.emit('error', { message: (err as Error).message });
      socket.disconnect(true);
      return;
    }

    // 2 — Enforce 2-participant cap (check BEFORE adding)
    const currentCount =
      await this.consultationService.getParticipantCount(roomId);
    if (currentCount >= 2) {
      socket.emit('room-full', {
        message: 'Room is full. Maximum 2 participants allowed.',
      });
      socket.disconnect(true);
      return;
    }

    // 3 — Join Socket.IO room + update Redis
    await socket.join(roomId);
    const newCount = await this.consultationService.addParticipant(
      roomId,
      userId,
    );

    // 4 — Track socket for disconnect cleanup
    this.socketRoom.set(socket.id, { roomId, userId });

    // 5 — Notify existing participant(s)
    socket.to(roomId).emit('user-joined');
    if (newCount === 2) socket.emit('room-ready');

    this.logger.log(`consultation participant joined (${newCount}/2)`);

    // 6 — Update room lifecycle state
    if (newCount === 1) {
      await this.consultationService.onRoomWaiting(roomId);
    } else if (newCount === 2) {
      await this.consultationService.onRoomActive(roomId);
    }
  }

  // ── offer ──────────────────────────────────────────────────────────────────

  /**
   * Relay a WebRTC SDP offer to the other participant in the room.
   */
  @SubscribeMessage('offer')
  handleOffer(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SdpPayload,
  ): void {
    const tracked = this.socketRoom.get(socket.id);
    if (!this.allowSignal(socket) || !this.isValidSdp(payload)) {
      socket.emit('error', { message: 'Invalid offer payload.' });
      return;
    }
    if (!tracked) {
      socket.emit('error', { message: 'You are not in a room.' });
      return;
    }
    // Relay only within the room this socket was authorised for, never a client-supplied one.
    socket
      .to(tracked.roomId)
      .emit('offer', { sdp: payload.sdp, from: socket.data.user.sub });
  }

  // ── answer ─────────────────────────────────────────────────────────────────

  /**
   * Relay a WebRTC SDP answer to the other participant in the room.
   */
  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SdpPayload,
  ): void {
    const tracked = this.socketRoom.get(socket.id);
    if (!this.allowSignal(socket) || !this.isValidSdp(payload)) {
      socket.emit('error', { message: 'Invalid answer payload.' });
      return;
    }
    if (!tracked) {
      socket.emit('error', { message: 'You are not in a room.' });
      return;
    }
    // Relay only within the room this socket was authorised for, never a client-supplied one.
    socket
      .to(tracked.roomId)
      .emit('answer', { sdp: payload.sdp, from: socket.data.user.sub });
  }

  // ── ice-candidate ──────────────────────────────────────────────────────────

  /**
   * Relay an ICE candidate to the other participant in the room.
   */
  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: IceCandidatePayload,
  ): void {
    const tracked = this.socketRoom.get(socket.id);
    if (!this.allowSignal(socket) || !this.isValidIceCandidate(payload)) {
      socket.emit('error', { message: 'Invalid ICE candidate payload.' });
      return;
    }
    if (!tracked) {
      socket.emit('error', { message: 'You are not in a room.' });
      return;
    }
    socket.to(tracked.roomId).emit('ice-candidate', {
      candidate: payload.candidate,
      from: socket.data.user.sub,
    });
  }

  /** Ask the existing patient offerer to restart ICE after the doctor detects a failed path. */
  @SubscribeMessage('renegotiate')
  handleRenegotiate(@ConnectedSocket() socket: AuthenticatedSocket): void {
    const tracked = this.socketRoom.get(socket.id);
    if (!tracked) {
      socket.emit('error', { message: 'You are not in a room.' });
      return;
    }
    if (!this.allowSignal(socket)) {
      socket.emit('error', { message: 'Signaling rate limit exceeded.' });
      return;
    }
    socket.to(tracked.roomId).emit('renegotiate');
  }

  // ── leave-room ─────────────────────────────────────────────────────────────

  /**
   * Explicit leave. Triggers the same cleanup as a disconnect.
   */
  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @ConnectedSocket() socket: AuthenticatedSocket,
  ): Promise<void> {
    await this.handleLeave(socket);
  }

  // ── call-rejected ──────────────────────────────────────────────────────────

  /**
   * Notify the room that the call was rejected, then leave.
   */
  @SubscribeMessage('call-rejected')
  async handleCallRejected(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: CallRejectedPayload,
  ): Promise<void> {
    const tracked = this.socketRoom.get(socket.id);
    if (!tracked) return;
    const reason = typeof payload?.reason === 'string' ? payload.reason.slice(0, 80) : 'rejected';
    socket.to(tracked.roomId).emit('call-ended', { reason });
    await this.handleLeave(socket);
  }

  @SubscribeMessage('call-connected')
  async handleCallConnected(@ConnectedSocket() socket: AuthenticatedSocket): Promise<void> {
    const tracked = this.socketRoom.get(socket.id);
    if (!tracked || (await this.consultationService.getParticipantCount(tracked.roomId)) !== 2) {
      socket.emit('error', { message: 'Both consultation participants must join first.' });
      return;
    }
    const connected = await this.consultationService.addConnectedParticipant(
      tracked.roomId,
      tracked.userId,
    );
    if (connected === 2) {
      await this.consultationService.onCallConnected(tracked.roomId);
      this.server.to(tracked.roomId).emit('call-connected');
    }
  }

  @SubscribeMessage('end-call')
  async handleEndCall(@ConnectedSocket() socket: AuthenticatedSocket): Promise<void> {
    const tracked = this.socketRoom.get(socket.id);
    if (!tracked) return;
    await this.consultationService.onCallEnded(tracked.roomId);
    socket.to(tracked.roomId).emit('call-ended', { reason: 'ended' });
    await this.handleLeave(socket);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Core leave logic shared by leave-room event, call-rejected, and disconnect.
   * Idempotent — safe to call even if the socket was never tracked.
   */
  private async handleLeave(socket: AuthenticatedSocket): Promise<void> {
    const tracked = this.socketRoom.get(socket.id);
    if (!tracked) return;

    const { roomId, userId } = tracked;

    // Remove from in-memory map first to prevent double execution
    this.socketRoom.delete(socket.id);

    // Leave Socket.IO room
    socket.leave(roomId);

    // Update Redis and get remaining count
    const remaining = await this.consultationService.removeParticipant(
      roomId,
      userId,
    );

    if (remaining === 0) {
      // A dropped connection is not a deliberate call completion.
      await this.consultationService.onRoomEmpty(roomId);
    } else {
      // One participant remains — go back to waiting
      await this.consultationService.onRoomWaiting(roomId);
    }

    // Notify whoever is still in the room
    socket.to(roomId).emit('user-left');
  }

  private readRoomId(payload: JoinRoomPayload | null | undefined): string | null {
    return typeof payload?.roomId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.roomId)
      ? payload.roomId
      : null;
  }

  private isValidSdp(payload: SdpPayload | null | undefined): boolean {
    const sdp = payload?.sdp;
    return !!sdp && typeof sdp === 'object' &&
      (sdp.type === 'offer' || sdp.type === 'answer') &&
      typeof sdp.sdp === 'string' && sdp.sdp.length > 0 && sdp.sdp.length <= 256_000;
  }

  private isValidIceCandidate(payload: IceCandidatePayload | null | undefined): boolean {
    const candidate = payload?.candidate;
    return !!candidate && typeof candidate === 'object' &&
      typeof candidate.candidate === 'string' && candidate.candidate.length <= 4096;
  }

  /** Bound signaling payload rate per authenticated socket to reduce abuse. */
  private allowSignal(socket: AuthenticatedSocket): boolean {
    const now = Date.now();
    const window = this.signalWindows.get(socket.id);
    if (!window || now - window.startedAt >= 10_000) {
      this.signalWindows.set(socket.id, { startedAt: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= 100;
  }
}
