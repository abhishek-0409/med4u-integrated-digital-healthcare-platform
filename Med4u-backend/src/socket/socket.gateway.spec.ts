/**
 * Signaling gateway behaviour for BOTH participants, with in-memory sockets and Redis around the real
 * ConsultationService and SocketGateway code. Covers who may join (patient, the appointment's doctor; nobody
 * else), the join window, relay of offer/answer/ICE, and how a call ends. Does not exercise real Socket.IO
 * transport or WebRTC media.
 */
import { ConsultationService } from '../modules/consultations/consultation.service';
import { AppointmentStatus, AppointmentType } from '../database/entities/appointment.entity';
import { SocketGateway } from './socket.gateway';

const ROOM = '0b9d3a52-52a4-4f56-9d7e-6a3c3b0f4a11';
const PATIENT = 'user-patient';
const DOCTOR = 'user-doctor';
const STRANGER = 'user-stranger';
const NOW = new Date('2026-06-15T10:00:00+05:30'); // a Monday, 10:00 IST

class FakeRedis {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  get = jest.fn(async (k: string) => this.strings.get(k) ?? null);
  set = jest.fn(async (k: string, v: string, ...rest: unknown[]) => {
    if (rest.includes('NX') && this.strings.has(k)) return null;
    this.strings.set(k, v);
    return 'OK';
  });
  setex = jest.fn(async (k: string, _ttl: number, v: string) => {
    this.strings.set(k, v);
    return 'OK';
  });
  del = jest.fn(async (...keys: string[]) => {
    keys.forEach((k) => {
      this.strings.delete(k);
      this.sets.delete(k);
    });
    return keys.length;
  });
  sadd = jest.fn(async (k: string, m: string) => {
    const s = this.sets.get(k) ?? new Set<string>();
    s.add(m);
    this.sets.set(k, s);
    return 1;
  });
  srem = jest.fn(async (k: string, m: string) => (this.sets.get(k)?.delete(m) ? 1 : 0));
  scard = jest.fn(async (k: string) => this.sets.get(k)?.size ?? 0);
  expire = jest.fn(async () => 1);
}

interface FakeSocket {
  id: string;
  data: { user: { sub: string }; consultationRoomId?: string };
  emit: jest.Mock;
  to: (room: string) => { emit: (event: string, payload?: unknown) => void };
  join: (room: string) => Promise<void>;
  leave: (room: string) => void;
  disconnect: jest.Mock;
  received: Array<{ event: string; payload?: unknown }>;
}

describe('SocketGateway consultation signaling', () => {
  let redis: FakeRedis;
  let appointmentRepo: { findOne: jest.Mock; update: jest.Mock };
  let gateway: SocketGateway;
  let rooms: Map<string, Set<FakeSocket>>;
  let appointment: any;
  let nextId = 0;

  const makeSocket = (userId: string, consultationRoomId?: string): FakeSocket => {
    const s: FakeSocket = {
      id: `s${(nextId += 1)}`,
      data: { user: { sub: userId }, consultationRoomId },
      received: [],
      emit: jest.fn((event: string, payload?: unknown) => s.received.push({ event, payload })),
      to: (room) => ({
        emit: (event, payload) =>
          rooms.get(room)?.forEach((other) => {
            if (other !== s) other.received.push({ event, payload });
          }),
      }),
      join: async (room) => {
        (rooms.get(room) ?? rooms.set(room, new Set()).get(room)!).add(s);
      },
      leave: (room) => {
        rooms.get(room)?.delete(s);
      },
      disconnect: jest.fn(),
    };
    return s;
  };
  const got = (s: FakeSocket, event: string) => s.received.filter((r) => r.event === event);
  const join = (s: FakeSocket) => gateway.handleJoinRoom(s as never, { roomId: ROOM });
  const sdp = (type: 'offer' | 'answer') => ({ roomId: ROOM, sdp: { type, sdp: `${type}-sdp` } });
  const ice = (c: string) => ({ roomId: ROOM, candidate: { candidate: c, sdpMid: '0', sdpMLineIndex: 0 } });

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    nextId = 0;
    rooms = new Map();
    redis = new FakeRedis();
    appointment = {
      id: ROOM,
      patientId: PATIENT,
      status: AppointmentStatus.CONFIRMED,
      type: AppointmentType.VIDEO,
      doctor: { userId: DOCTOR, isDemo: false },
      slot: { date: '2026-06-15', startTime: '10:00:00', endTime: '10:30:00' },
    };
    appointmentRepo = {
      findOne: jest.fn(async () => appointment),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const service = new ConsultationService(appointmentRepo as never, {} as never, {} as never, redis as never);
    gateway = new SocketGateway(service, {} as never);
    (gateway as unknown as { server: unknown }).server = {
      to: (room: string) => ({
        emit: (event: string, payload?: unknown) => rooms.get(room)?.forEach((s) => s.received.push({ event, payload })),
      }),
    };
  });
  afterEach(() => jest.useRealTimers());

  describe('who may join', () => {
    it('admits the patient and then the appointment doctor, telling each what to do', async () => {
      const patient = makeSocket(PATIENT);
      const doctor = makeSocket(DOCTOR);
      await join(patient);
      expect(got(patient, 'room-ready')).toHaveLength(0); // alone: waiting
      await join(doctor);
      expect(got(patient, 'user-joined')).toHaveLength(1); // the patient (offer-maker) learns the doctor is here
      expect(got(doctor, 'room-ready')).toHaveLength(1);
      expect(patient.disconnect).not.toHaveBeenCalled();
      expect(doctor.disconnect).not.toHaveBeenCalled();
    });

    it('works the other way round: the doctor waits, then the patient joining gets room-ready', async () => {
      const patient = makeSocket(PATIENT);
      const doctor = makeSocket(DOCTOR);
      await join(doctor);
      await join(patient);
      expect(got(doctor, 'user-joined')).toHaveLength(1);
      expect(got(patient, 'room-ready')).toHaveLength(1);
    });

    it('refuses a user who is neither the patient nor the appointment doctor', async () => {
      const stranger = makeSocket(STRANGER);
      await join(stranger);
      expect(got(stranger, 'error')[0]?.payload).toMatchObject({ message: expect.stringMatching(/not a participant/i) });
      expect(stranger.disconnect).toHaveBeenCalledWith(true);
      expect(rooms.get(ROOM)?.size ?? 0).toBe(0);
    });

    it('refuses a room token scoped to a different appointment', async () => {
      const s = makeSocket(PATIENT, '11111111-1111-4111-8111-111111111111');
      await join(s);
      expect(got(s, 'error')[0]?.payload).toMatchObject({ message: expect.stringMatching(/different appointment/i) });
      expect(s.disconnect).toHaveBeenCalledWith(true);
    });

    it('refuses the same user connecting a second time (second device)', async () => {
      const first = makeSocket(DOCTOR);
      const second = makeSocket(DOCTOR);
      await join(first);
      await join(second);
      expect(second.disconnect).toHaveBeenCalledWith(true);
      expect(first.disconnect).not.toHaveBeenCalled();
    });

    it('refuses a malformed room id', async () => {
      const s = makeSocket(PATIENT);
      await gateway.handleJoinRoom(s as never, { roomId: 'not-a-uuid' });
      expect(got(s, 'error')).toHaveLength(1);
    });

    it.each([
      ['too early (30 minutes before the slot)', new Date('2026-06-15T09:30:00+05:30')],
      ['too late (45 minutes after the slot ends)', new Date('2026-06-15T11:15:00+05:30')],
    ])('refuses both participants when it is %s', async (_label, when) => {
      jest.setSystemTime(when);
      for (const user of [PATIENT, DOCTOR]) {
        const s = makeSocket(user);
        await join(s);
        expect(got(s, 'error')).toHaveLength(1);
        expect(s.disconnect).toHaveBeenCalledWith(true);
      }
    });

    it('allows joining 10 minutes early', async () => {
      jest.setSystemTime(new Date('2026-06-15T09:50:30+05:30'));
      const s = makeSocket(DOCTOR);
      await join(s);
      expect(s.disconnect).not.toHaveBeenCalled();
      expect(got(s, 'error')).toHaveLength(0);
    });

    it.each([
      ['an unpaid (pending) appointment', { status: AppointmentStatus.PENDING }],
      ['a cancelled appointment', { status: AppointmentStatus.CANCELLED }],
      ['a completed appointment', { status: AppointmentStatus.COMPLETED }],
      ['an in-person appointment', { type: AppointmentType.IN_PERSON }],
      ['a demo doctor', { doctor: { userId: DOCTOR, isDemo: true } }],
    ])('refuses %s', async (_label, patch) => {
      Object.assign(appointment, patch);
      const s = makeSocket(DOCTOR);
      await join(s);
      expect(got(s, 'error')).toHaveLength(1);
      expect(s.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('relay', () => {
    let patient: FakeSocket;
    let doctor: FakeSocket;
    beforeEach(async () => {
      patient = makeSocket(PATIENT);
      doctor = makeSocket(DOCTOR);
      await join(patient);
      await join(doctor);
    });

    it('delivers the patient offer to the doctor only, and the doctor answer to the patient only', () => {
      gateway.handleOffer(patient as never, sdp('offer'));
      expect(got(doctor, 'offer')[0]?.payload).toMatchObject({ sdp: { type: 'offer' }, from: PATIENT });
      expect(got(patient, 'offer')).toHaveLength(0);

      gateway.handleAnswer(doctor as never, sdp('answer'));
      expect(got(patient, 'answer')[0]?.payload).toMatchObject({ sdp: { type: 'answer' }, from: DOCTOR });
      expect(got(doctor, 'answer')).toHaveLength(0);
    });

    it('relays ICE candidates in both directions', () => {
      gateway.handleIceCandidate(patient as never, ice('candidate:p'));
      gateway.handleIceCandidate(doctor as never, ice('candidate:d'));
      expect(got(doctor, 'ice-candidate')[0]?.payload).toMatchObject({ candidate: { candidate: 'candidate:p' }, from: PATIENT });
      expect(got(patient, 'ice-candidate')[0]?.payload).toMatchObject({ candidate: { candidate: 'candidate:d' }, from: DOCTOR });
    });

    it('relays a scoped ICE renegotiation request to the patient offerer', () => {
      gateway.handleRenegotiate(doctor as never);
      expect(got(patient, 'renegotiate')).toHaveLength(1);
      expect(got(doctor, 'renegotiate')).toHaveLength(0);
      const intruder = makeSocket(STRANGER);
      gateway.handleRenegotiate(intruder as never);
      expect(got(intruder, 'error')).toHaveLength(1);
      expect(got(patient, 'renegotiate')).toHaveLength(1);
    });

    it('ignores client-supplied room ids: a socket can only signal into the room it joined', () => {
      const intruder = makeSocket(STRANGER); // never joined
      gateway.handleOffer(intruder as never, sdp('offer'));
      expect(got(intruder, 'error')[0]?.payload).toMatchObject({ message: expect.stringMatching(/not in a room/i) });
      expect(got(doctor, 'offer')).toHaveLength(0);
      expect(got(patient, 'offer')).toHaveLength(0);
    });

    it('rejects malformed SDP and ICE payloads', () => {
      gateway.handleOffer(patient as never, { roomId: ROOM, sdp: { type: 'rollback', sdp: 'x' } });
      gateway.handleOffer(patient as never, { roomId: ROOM, sdp: { type: 'offer', sdp: 'x'.repeat(256_001) } });
      gateway.handleIceCandidate(doctor as never, { roomId: ROOM, candidate: { candidate: 'c'.repeat(5000) } });
      expect(got(patient, 'error')).toHaveLength(2);
      expect(got(doctor, 'error')).toHaveLength(1);
      expect(got(doctor, 'offer')).toHaveLength(0);
    });

    it('rate-limits a flood of signaling messages from one socket', () => {
      for (let i = 0; i < 130; i += 1) gateway.handleIceCandidate(patient as never, ice(`candidate:${i}`));
      expect(got(doctor, 'ice-candidate').length).toBe(100);
      expect(got(patient, 'error').length).toBe(30);
    });
  });

  describe('call lifecycle', () => {
    let patient: FakeSocket;
    let doctor: FakeSocket;
    beforeEach(async () => {
      patient = makeSocket(PATIENT);
      doctor = makeSocket(DOCTOR);
      await join(patient);
      await join(doctor);
    });

    it('confirms the call only after BOTH participants report a connected media peer', async () => {
      await gateway.handleCallConnected(doctor as never);
      expect(got(patient, 'call-connected')).toHaveLength(0);
      expect(appointmentRepo.update).not.toHaveBeenCalled();
      await gateway.handleCallConnected(patient as never);
      expect(got(patient, 'call-connected')).toHaveLength(1);
      expect(got(doctor, 'call-connected')).toHaveLength(1);
      expect(appointmentRepo.update).toHaveBeenCalledWith(ROOM, { callLog: { startedAt: expect.any(String) } });
    });

    it.each([
      ['doctor', () => doctor, () => patient],
      ['patient', () => patient, () => doctor],
    ])('when the %s ends a connected call, the appointment completes and the other side is told', async (_who, ender, other) => {
      await gateway.handleCallConnected(doctor as never);
      await gateway.handleCallConnected(patient as never);
      jest.setSystemTime(new Date(NOW.getTime() + 125_000));

      await gateway.handleEndCall(ender() as never);

      expect(got(other(), 'call-ended')[0]?.payload).toMatchObject({ reason: 'ended' });
      expect(appointmentRepo.update).toHaveBeenCalledWith(
        { id: ROOM, status: AppointmentStatus.CONFIRMED },
        { status: AppointmentStatus.COMPLETED, callLog: expect.objectContaining({ durationSeconds: 125 }) },
      );
      expect(got(other(), 'user-left')).toHaveLength(1);
    });

    it('does not complete the appointment if the call never connected', async () => {
      await gateway.handleEndCall(doctor as never);
      expect(appointmentRepo.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: AppointmentStatus.COMPLETED }));
      expect(got(patient, 'call-ended')).toHaveLength(1);
    });

    it('a dropped connection is not a completed consultation: the peer is told the user left', async () => {
      await gateway.handleCallConnected(doctor as never);
      await gateway.handleCallConnected(patient as never);
      gateway.handleDisconnect(doctor as never);
      await jest.advanceTimersByTimeAsync(0);
      expect(got(patient, 'user-left')).toHaveLength(1);
      expect(appointmentRepo.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: AppointmentStatus.COMPLETED }));
    });

    it('lets a participant rejoin after a drop and the peer is told to renegotiate', async () => {
      gateway.handleDisconnect(doctor as never);
      await jest.advanceTimersByTimeAsync(0);
      const rejoined = makeSocket(DOCTOR);
      await join(rejoined);
      expect(rejoined.disconnect).not.toHaveBeenCalled();
      expect(got(patient, 'user-joined').length).toBe(2); // once initially, once after the rejoin
      expect(got(rejoined, 'room-ready')).toHaveLength(1);
    });
  });
});
