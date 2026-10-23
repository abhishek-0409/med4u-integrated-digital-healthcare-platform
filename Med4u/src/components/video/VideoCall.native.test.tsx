/**
 * Role audit for the call component: does the DOCTOR side really work, not just the patient side?
 *
 * The WebRTC native module and socket.io are replaced by in-memory fakes, and a tiny relay mimics the backend
 * gateway's behaviour (join-room -> user-joined / room-ready, relay of offer / answer / ice-candidate,
 * end-call -> call-ended). This verifies the component's signaling logic in both roles and both join orders.
 * It does NOT prove real audio/video on devices: that needs the two-phone test.
 */
import React from "react";
import { Alert } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

type Handler = (payload?: any) => void;

const mockState: {
  sockets: any[];
  peers: any[];
  streams: any[];
  denyMedia: boolean;
  server: any;
} = { sockets: [], peers: [], streams: [], denyMedia: false, server: null };

jest.mock("../doctor/DoctorPortrait", () => ({ DoctorPortrait: () => null }));
jest.mock("../../config/env", () => ({
  env: { apiUrl: "http://test.local:3000/api" },
}));

jest.mock("socket.io-client", () => ({
  io: (_url: string, opts: { auth: { token: string } }) => {
    const handlers: Record<string, Handler[]> = {};
    const socket: any = {
      id: `sock-${mockState.sockets.length + 1}`,
      token: opts.auth.token,
      emitted: [] as Array<{ event: string; payload?: any }>,
      handlers,
      connected: false,
      on: (event: string, fn: Handler) => {
        (handlers[event] ??= []).push(fn);
        return socket;
      },
      emit: (event: string, payload?: any) => {
        socket.emitted.push({ event, payload });
        mockState.server?.onClientEvent(socket, event, payload);
      },
      connect: () => {
        setTimeout(() => {
          socket.connected = true;
          socket.trigger("connect");
        }, 0);
      },
      disconnect: jest.fn(() => {
        socket.connected = false;
      }),
      removeAllListeners: () => {
        for (const k of Object.keys(handlers)) delete handlers[k];
      },
      io: { on: jest.fn(), off: jest.fn() },
      /** Deliver an event to the component as if it came from the server. */
      trigger: (event: string, payload?: any) =>
        (handlers[event] ?? []).forEach((fn) => fn(payload)),
    };
    mockState.sockets.push(socket);
    return socket;
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("react-native-incall-manager", () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    setForceSpeakerphoneOn: jest.fn(),
  },
}));

jest.mock("react-native-webrtc", () => {
  const React = require("react");
  const { View } = require("react-native");
  class RTCSessionDescription {
    constructor(init: any) {
      Object.assign(this, init);
    }
  }
  class RTCIceCandidate {
    init: any;
    constructor(init: any) {
      this.init = init;
      Object.assign(this, init);
    }
    toJSON() {
      return this.init;
    }
  }
  const RTCView = (props: { streamURL: string }) =>
    React.createElement(View, { testID: `rtcview:${props.streamURL}` });
  function RTCPeerConnection(this: unknown, config: unknown) {
    const listeners: Record<string, Handler[]> = {};
    const peer: any = {
      config,
      calls: [] as string[],
      candidates: [] as any[],
      remoteDescription: null as any,
      localDescription: null as any,
      connectionState: "new",
      iceConnectionState: "new",
      closed: false,
      addTrack: () => peer.calls.push("addTrack"),
      addEventListener: (ev: string, fn: Handler) => {
        (listeners[ev] ??= []).push(fn);
      },
      fire: (ev: string, payload?: any) =>
        (listeners[ev] ?? []).forEach((fn) => fn(payload)),
      createOffer: async (opts: unknown) => {
        peer.calls.push("createOffer");
        peer.lastOfferOptions = opts;
        return { type: "offer", sdp: "offer-sdp" };
      },
      createAnswer: async () => {
        peer.calls.push("createAnswer");
        return { type: "answer", sdp: "answer-sdp" };
      },
      setLocalDescription: async (d: any) => {
        peer.localDescription = d;
        peer.calls.push(`setLocal:${d.type}`);
      },
      setRemoteDescription: async (d: any) => {
        peer.remoteDescription = d;
        peer.calls.push(`setRemote:${d.type}`);
      },
      addIceCandidate: async (c: any) => {
        peer.candidates.push(c);
        peer.calls.push("addIce");
      },
      close: () => {
        peer.closed = true;
      },
    };
    mockState.peers.push(peer);
    return peer;
  }
  return {
    mediaDevices: {
      getUserMedia: async () => {
        if (mockState.denyMedia) {
          const e = new Error("denied");
          e.name = "NotAllowedError";
          throw e;
        }
        const tracks = [
          { kind: "audio", enabled: true, stop: jest.fn() },
          {
            kind: "video",
            enabled: true,
            stop: jest.fn(),
            _switchCamera: jest.fn(),
          },
        ];
        const stream: any = {
          tracks,
          getTracks: () => tracks,
          getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
          getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
          toURL: () => `local:${mockState.streams.length}`,
        };
        mockState.streams.push(stream);
        return stream;
      },
    },
    MediaStream: class {},
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    RTCView,
  };
});

import { VideoCall } from "./VideoCall.native";
import InCallManager from "react-native-incall-manager";

const APPT = "0b9d3a52-52a4-4f56-9d7e-6a3c3b0f4a11";

/** Mimics the backend gateway for the parts the component depends on. */
class MockServer {
  room: any[] = [];
  connectedReports = new Set<string>();
  onClientEvent(socket: any, event: string, payload?: any) {
    const others = this.room.filter((s) => s !== socket);
    const deliver = (target: any, ev: string, data?: any) =>
      setTimeout(() => target.trigger(ev, data), 0);
    if (event === "join-room") {
      this.room.push(socket);
      others.forEach((o) => deliver(o, "user-joined"));
      if (this.room.length === 2) deliver(socket, "room-ready");
    } else if (event === "offer" || event === "answer") {
      others.forEach((o) =>
        deliver(o, event, { sdp: payload.sdp, from: socket.id }),
      );
    } else if (event === "ice-candidate") {
      others.forEach((o) =>
        deliver(o, event, { candidate: payload.candidate, from: socket.id }),
      );
    } else if (event === "renegotiate") {
      others.forEach((o) => deliver(o, "renegotiate"));
    } else if (event === "call-connected") {
      this.connectedReports.add(socket.id);
      if (this.connectedReports.size === 2)
        this.room.forEach((s) => deliver(s, "call-connected"));
    } else if (event === "end-call") {
      others.forEach((o) => deliver(o, "call-ended", { reason: "ended" }));
      this.room = this.room.filter((s) => s !== socket);
    } else if (event === "leave-room") {
      this.room = this.room.filter((s) => s !== socket);
      others.forEach((o) => deliver(o, "user-left"));
    }
  }
}

const flush = async () => {
  for (let i = 0; i < 6; i += 1)
    await act(async () => new Promise((r) => setTimeout(r, 0)));
};

const baseProps = (role: "patient" | "doctor") => ({
  appointmentId: APPT,
  displayName: role === "patient" ? "Dr Test" : "Pat Test",
  doctorName: "Dr Test",
  doctorSpecialization: "General Medicine",
  doctorId: "doc-1",
  isPatient: role === "patient",
  credentials: {
    roomId: APPT,
    token: `${role}-token`,
    stunServers: [{ urls: "stun:stun.example" }],
    turnServers: [],
  },
  onExit: jest.fn(),
});

async function mount(role: "patient" | "doctor") {
  const r = render(<VideoCall {...baseProps(role)} />);
  await flush();
  const socket = mockState.sockets[mockState.sockets.length - 1];
  const peer = mockState.peers[mockState.peers.length - 1];
  return { ...r, socket, peer };
}

const emitted = (socket: any, event: string) =>
  socket.emitted.filter((e: any) => e.event === event);
const remoteStream = (
  url: string,
  kinds: string[] = ["audio", "video"],
): any => ({
  toURL: () => url,
  getTracks: () => kinds.map((kind) => ({ kind, readyState: "live" })),
});

beforeEach(() => {
  mockState.sockets = [];
  mockState.peers = [];
  mockState.streams = [];
  mockState.denyMedia = false;
  mockState.server = null;
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
});
afterEach(() => jest.restoreAllMocks());

describe("doctor role (isPatient = false)", () => {
  it("joins the room with its room token and the configured ICE servers", async () => {
    const { socket, peer } = await mount("doctor");
    expect(emitted(socket, "join-room")).toEqual([
      { event: "join-room", payload: { roomId: APPT } },
    ]);
    expect(socket.token).toBe("doctor-token");
    expect(peer.config.iceServers).toEqual([{ urls: "stun:stun.example" }]);
    expect(peer.calls.filter((c: string) => c === "addTrack")).toHaveLength(2);
  });

  it("never creates an offer: only the patient initiates", async () => {
    const { socket, peer } = await mount("doctor");
    socket.trigger("room-ready");
    socket.trigger("user-joined");
    await flush();
    expect(peer.calls).not.toContain("createOffer");
    expect(emitted(socket, "offer")).toHaveLength(0);
  });

  it("answers an incoming offer: set remote offer, create and set answer, send answer", async () => {
    const { socket, peer } = await mount("doctor");
    socket.trigger("offer", {
      sdp: { type: "offer", sdp: "offer-sdp" },
      from: "patient",
    });
    await flush();
    expect(peer.calls).toEqual(
      expect.arrayContaining([
        "setRemote:offer",
        "createAnswer",
        "setLocal:answer",
      ]),
    );
    expect(peer.calls.indexOf("setRemote:offer")).toBeLessThan(
      peer.calls.indexOf("createAnswer"),
    );
    expect(emitted(socket, "answer")).toEqual([
      {
        event: "answer",
        payload: { roomId: APPT, sdp: { type: "answer", sdp: "answer-sdp" } },
      },
    ]);
  });

  it("queues ICE candidates that arrive before the offer and applies them afterwards; later ones apply at once", async () => {
    const { socket, peer } = await mount("doctor");
    socket.trigger("ice-candidate", {
      candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
      from: "patient",
    });
    socket.trigger("ice-candidate", {
      candidate: { candidate: "candidate:2", sdpMid: "0", sdpMLineIndex: 0 },
      from: "patient",
    });
    await flush();
    expect(peer.candidates).toHaveLength(0); // no remote description yet

    socket.trigger("offer", {
      sdp: { type: "offer", sdp: "offer-sdp" },
      from: "patient",
    });
    await flush();
    expect(peer.candidates.map((c: any) => c.candidate)).toEqual([
      "candidate:1",
      "candidate:2",
    ]);

    socket.trigger("ice-candidate", {
      candidate: { candidate: "candidate:3", sdpMid: "0", sdpMLineIndex: 0 },
      from: "patient",
    });
    await flush();
    expect(peer.candidates.map((c: any) => c.candidate)).toEqual([
      "candidate:1",
      "candidate:2",
      "candidate:3",
    ]);
  });

  it("sends its own ICE candidates to the other participant", async () => {
    const { socket, peer } = await mount("doctor");
    peer.fire("icecandidate", {
      candidate: {
        toJSON: () => ({
          candidate: "candidate:mine",
          sdpMid: "0",
          sdpMLineIndex: 0,
        }),
      },
    });
    peer.fire("icecandidate", { candidate: null }); // end-of-candidates is not sent
    expect(emitted(socket, "ice-candidate")).toEqual([
      {
        event: "ice-candidate",
        payload: {
          roomId: APPT,
          candidate: {
            candidate: "candidate:mine",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      },
    ]);
  });

  it("renders the remote stream when a track arrives", async () => {
    const { peer } = await mount("doctor");
    expect(screen.queryByTestId("rtcview:remote:patient")).toBeNull();
    await act(async () => {
      peer.fire("track", { streams: [remoteStream("remote:patient")] });
    });
    expect(screen.getByTestId("rtcview:remote:patient")).toBeTruthy();
  });

  it("uses a compact control pill and keeps camera actions connected to the local tracks", async () => {
    await mount("doctor");
    expect(screen.getByTestId("call-control-pill")).toBeTruthy();
    expect(InCallManager.start).toHaveBeenCalledWith({ media: "video" });
    fireEvent.press(screen.getByLabelText("Switch to earpiece"));
    expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
    fireEvent.press(screen.getByLabelText("Mute microphone"));
    fireEvent.press(screen.getByLabelText("Turn camera off"));
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByLabelText("Switch camera"));
    expect(mockState.streams[0].tracks[0].enabled).toBe(false);
    expect(mockState.streams[0].tracks[1].enabled).toBe(false);
    expect(mockState.streams[0].tracks[1]._switchCamera).toHaveBeenCalledTimes(1);
  });

  it("waits for live remote audio and video before reporting Connected", async () => {
    const { socket, peer } = await mount("doctor");
    await act(async () => {
      peer.connectionState = "connected";
      peer.fire("connectionstatechange");
      peer.fire("connectionstatechange");
    });
    expect(emitted(socket, "call-connected")).toHaveLength(0);
    expect(screen.queryByText("Connected")).toBeNull();
    await act(async () => {
      peer.fire("track", { streams: [remoteStream("remote:patient")] });
    });
    expect(emitted(socket, "call-connected")).toHaveLength(1);
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
  });

  it("ending the call emits end-call, shows the ended state and stops the camera and microphone", async () => {
    const { socket } = await mount("doctor");
    const local = mockState.streams[0];
    fireEvent.press(screen.getByLabelText("End call"));
    await flush();
    expect(emitted(socket, "end-call")).toHaveLength(1);
    expect(screen.getByText("Consultation ended")).toBeTruthy();
    local.tracks.forEach((t: any) => expect(t.stop).toHaveBeenCalled());
  });

  it("when the patient ends the call, shows the ended state, leaves the room and releases media", async () => {
    const { socket, peer } = await mount("doctor");
    const local = mockState.streams[0];
    await act(async () => {
      socket.trigger("call-ended", { reason: "ended" });
    });
    await flush();
    expect(screen.getByText("Consultation ended")).toBeTruthy();
    expect(emitted(socket, "leave-room")).toHaveLength(1);
    expect(peer.closed).toBe(true);
    local.tracks.forEach((t: any) => expect(t.stop).toHaveBeenCalled());
  });

  it("fails clearly, without opening a signaling connection, when camera or microphone permission is denied", async () => {
    mockState.denyMedia = true;
    render(<VideoCall {...baseProps("doctor")} />);
    await flush();
    expect(screen.getByText(/permission was denied/i)).toBeTruthy();
    expect(mockState.sockets).toHaveLength(0);
  });

  it("refuses a room token issued for a different appointment", async () => {
    const props = baseProps("doctor");
    render(
      <VideoCall
        {...props}
        credentials={{
          ...props.credentials,
          roomId: "11111111-1111-4111-8111-111111111111",
        }}
      />,
    );
    await flush();
    expect(
      screen.getByText(/not configured for this appointment/i),
    ).toBeTruthy();
    expect(mockState.sockets).toHaveLength(0);
  });
});

describe("patient role (isPatient = true)", () => {
  it("creates and sends the offer when the room becomes ready, and only once", async () => {
    const { socket, peer } = await mount("patient");
    socket.trigger("room-ready");
    socket.trigger("user-joined");
    socket.trigger("room-ready");
    await flush();
    expect(peer.calls.filter((c: string) => c === "createOffer")).toHaveLength(
      1,
    );
    expect(emitted(socket, "offer")).toEqual([
      {
        event: "offer",
        payload: { roomId: APPT, sdp: { type: "offer", sdp: "offer-sdp" } },
      },
    ]);
  });

  it("restarts ICE negotiation when the doctor requests a refreshed patient offer", async () => {
    const { socket, peer } = await mount("patient");
    socket.trigger("room-ready");
    await flush();
    socket.trigger("renegotiate");
    await flush();
    expect(peer.calls.filter((call: string) => call === "createOffer")).toHaveLength(2);
    expect(peer.lastOfferOptions).toMatchObject({ iceRestart: true });
  });

  it("restarts the patient offer after its own ICE connection fails", async () => {
    const { socket, peer } = await mount("patient");
    socket.trigger("room-ready");
    await flush();
    peer.connectionState = "failed";
    peer.iceConnectionState = "failed";
    await act(async () => { peer.fire("connectionstatechange"); });
    await flush();
    expect(peer.calls.filter((call: string) => call === "createOffer")).toHaveLength(2);
    expect(peer.lastOfferOptions).toMatchObject({ iceRestart: true });
  });

  it("applies the doctor's answer and flushes ICE candidates that arrived early", async () => {
    const { socket, peer } = await mount("patient");
    socket.trigger("room-ready");
    await flush();
    socket.trigger("ice-candidate", {
      candidate: {
        candidate: "candidate:early",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
      from: "doctor",
    });
    await flush();
    expect(peer.candidates).toHaveLength(0);
    socket.trigger("answer", {
      sdp: { type: "answer", sdp: "answer-sdp" },
      from: "doctor",
    });
    await flush();
    expect(peer.calls).toContain("setRemote:answer");
    expect(peer.candidates.map((c: any) => c.candidate)).toEqual([
      "candidate:early",
    ]);
  });
});

describe("patient and doctor together over the signaling relay", () => {
  const renderBoth = async (first: "patient" | "doctor") => {
    mockState.server = new MockServer();
    const second = first === "patient" ? "doctor" : "patient";
    // Each component keeps its own render result: `screen` only points at the most recent one.
    const firstUi = render(<VideoCall {...baseProps(first)} />);
    await flush();
    const firstSide = {
      socket: mockState.sockets[0],
      peer: mockState.peers[0],
      ui: firstUi,
    };
    const secondUi = render(<VideoCall {...baseProps(second)} />);
    await flush();
    const secondSide = {
      socket: mockState.sockets[1],
      peer: mockState.peers[1],
      ui: secondUi,
    };
    return first === "patient"
      ? { patient: firstSide, doctor: secondSide }
      : { patient: secondSide, doctor: firstSide };
  };

  it.each(["patient", "doctor"] as const)(
    "completes the handshake when the %s joins first",
    async (first) => {
      const { patient, doctor } = await renderBoth(first);

      // The patient made the offer, the doctor answered it, and each applied the other's description.
      expect(patient.peer.calls).toEqual(
        expect.arrayContaining([
          "createOffer",
          "setLocal:offer",
          "setRemote:answer",
        ]),
      );
      expect(doctor.peer.calls).toEqual(
        expect.arrayContaining([
          "setRemote:offer",
          "createAnswer",
          "setLocal:answer",
        ]),
      );
      expect(doctor.peer.calls).not.toContain("createOffer");

      // ICE flows both ways and is applied on the other side.
      patient.peer.fire("icecandidate", {
        candidate: {
          toJSON: () => ({
            candidate: "candidate:p",
            sdpMid: "0",
            sdpMLineIndex: 0,
          }),
        },
      });
      doctor.peer.fire("icecandidate", {
        candidate: {
          toJSON: () => ({
            candidate: "candidate:d",
            sdpMid: "0",
            sdpMLineIndex: 0,
          }),
        },
      });
      await flush();
      expect(doctor.peer.candidates.map((c: any) => c.candidate)).toContain(
        "candidate:p",
      );
      expect(patient.peer.candidates.map((c: any) => c.candidate)).toContain(
        "candidate:d",
      );

      // Media arrives on both sides and both report connected; the server then confirms the call.
      await act(async () => {
        patient.peer.fire("track", {
          streams: [remoteStream("remote:to-patient")],
        });
        doctor.peer.fire("track", {
          streams: [remoteStream("remote:to-doctor")],
        });
        patient.peer.connectionState = "connected";
        doctor.peer.connectionState = "connected";
        patient.peer.fire("connectionstatechange");
        doctor.peer.fire("connectionstatechange");
      });
      await flush();
      expect(patient.ui.getByTestId("rtcview:remote:to-patient")).toBeTruthy();
      expect(doctor.ui.getByTestId("rtcview:remote:to-doctor")).toBeTruthy();
      expect(patient.ui.queryByTestId("rtcview:remote:to-doctor")).toBeNull(); // each side shows the OTHER person
      expect(emitted(patient.socket, "call-connected").length).toBe(1);
      expect(emitted(doctor.socket, "call-connected").length).toBe(1);
    },
  );

  it("when the doctor ends the call, the patient is told and shows the ended state", async () => {
    const { doctor, patient } = await renderBoth("patient");
    await act(async () => {
      doctor.peer.connectionState = "connected";
      patient.peer.connectionState = "connected";
      doctor.peer.fire("connectionstatechange");
      patient.peer.fire("connectionstatechange");
    });
    await flush();
    fireEvent.press(doctor.ui.getByLabelText("End call"));
    await flush();
    expect(emitted(doctor.socket, "end-call")).toHaveLength(1);
    expect(doctor.ui.getByText("Consultation ended")).toBeTruthy();
    expect(patient.ui.getByText("Consultation ended")).toBeTruthy(); // the patient was told
    expect(emitted(patient.socket, "end-call")).toHaveLength(0);
  });
});
