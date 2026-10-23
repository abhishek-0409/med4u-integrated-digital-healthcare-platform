import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
const mockAct = require("@testing-library/react-native").act;

const mockState: { socket: any; peer: any; mediaError: unknown; tracks: any[] } = { socket: null, peer: null, mediaError: null, tracks: [] };

jest.mock("../config/env", () => ({
  env: { apiUrl: "http://test.local:3000/api" },
}));

jest.mock("socket.io-client", () => ({
  io: () => {
    const handlers: Record<string, Array<(payload?: any) => void>> = {};
    const socket: any = {
      io: { on: jest.fn(), off: jest.fn() },
      handlers,
      emitted: [] as Array<{ event: string; payload?: any }>,
      on: (event: string, fn: (payload?: any) => void) => {
        (handlers[event] ??= []).push(fn);
        return socket;
      },
      emit: (event: string, payload?: any) =>
        socket.emitted.push({ event, payload }),
      connect: () => setTimeout(() => mockAct(() => (handlers.connect ?? []).forEach((fn) => fn())), 0),
      disconnect: jest.fn(),
      removeAllListeners: () => Object.keys(handlers).forEach((event) => { handlers[event] = []; }),
      trigger: (event: string, payload?: any) =>
        (handlers[event] ?? []).forEach((fn) => fn(payload)),
    };
    mockState.socket = socket;
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
  class MockPeer {
    handlers: Record<string, Array<(event?: any) => void>> = {};
    remoteDescription: any = null;
    connectionState = "new";
    iceConnectionState = "new";
    candidates: any[] = [];
    addTrack = jest.fn();
    addEventListener(event: string, fn: (payload?: any) => void) {
      (this.handlers[event] ??= []).push(fn);
    }
    fire(event: string, payload?: any) {
      (this.handlers[event] ?? []).forEach((fn) => fn(payload));
    }
    setRemoteDescription = async (description: any) => {
      this.remoteDescription = description;
    };
    createAnswer = async () => ({ type: "answer", sdp: "doctor-answer" });
    setLocalDescription = jest.fn();
    addIceCandidate = async (candidate: any) => this.candidates.push(candidate);
    close = jest.fn();
  }
  class Description {
    constructor(value: unknown) {
      Object.assign(this, value);
    }
  }
  class Candidate {
    constructor(value: unknown) {
      Object.assign(this, value);
    }
  }
  return {
    mediaDevices: {
      getUserMedia: async () => {
        if (mockState.mediaError) throw mockState.mediaError;
        mockState.tracks = [
          { kind: "audio", readyState: "live", enabled: true, stop: jest.fn() },
          { kind: "video", readyState: "live", enabled: true, stop: jest.fn(), _switchCamera: jest.fn() },
        ];
        return {
          getTracks: () => mockState.tracks,
          getAudioTracks: () => mockState.tracks.filter((track) => track.kind === "audio"),
          getVideoTracks: () => mockState.tracks.filter((track) => track.kind === "video"),
          toURL: () => "local:test",
        };
      },
    },
    RTCPeerConnection: class extends MockPeer {
      constructor(config: unknown) {
        super();
        (this as any).config = config;
        mockState.peer = this;
      }
    },
    RTCSessionDescription: Description,
    RTCIceCandidate: Candidate,
    RTCView: (props: { streamURL: string }) =>
      React.createElement(View, { testID: `rtc:${props.streamURL}` }),
  };
});

import { VideoConsultation } from "./VideoConsultation";
import InCallManager from "react-native-incall-manager";

const credentials = {
  roomId: "appointment-1",
  token: "room-token",
  stunServers: [{ urls: "stun:stun.example.test:3478" }],
  turnServers: [],
};

describe("Doctor App video consultation", () => {
  beforeEach(() => {
    mockState.socket = null;
    mockState.peer = null;
    mockState.mediaError = null;
    mockState.tracks = [];
  });

  it("answers the patient offer, relays ICE, and reports connected only after audio and video arrive", async () => {
    render(
      <VideoConsultation
        credentials={credentials}
        patientName="Synthetic patient"
        onExit={jest.fn()}
      />,
    );
    await waitFor(() =>
      expect(mockState.socket?.emitted).toContainEqual({
        event: "join-room",
        payload: { roomId: credentials.roomId },
      }),
    );
    expect(await screen.findByText("Waiting for the patient to join")).toBeTruthy();
    expect(screen.queryByTestId("rtc:remote:patient")).toBeNull();
    expect(screen.getByTestId("call-control-pill")).toBeTruthy();
    expect(screen.getByLabelText("More options")).toBeTruthy();

    await act(async () => {
      mockState.socket.trigger("offer", {
        sdp: { type: "offer", sdp: "patient-offer" },
        from: "patient",
      });
    });
    expect(mockState.peer.remoteDescription).toMatchObject({
      type: "offer",
      sdp: "patient-offer",
    });
    expect(mockState.socket.emitted).toContainEqual({
      event: "answer",
      payload: {
        roomId: credentials.roomId,
        sdp: { type: "answer", sdp: "doctor-answer" },
      },
    });

    await act(async () => {
      mockState.socket.trigger("ice-candidate", {
        candidate: { candidate: "candidate:patient" },
        from: "patient",
      });
    });
    expect(mockState.peer.candidates).toHaveLength(1);
    await act(async () => {
      mockState.peer.fire("icecandidate", {
        candidate: { toJSON: () => ({ candidate: "candidate:doctor" }) },
      });
    });
    expect(mockState.socket.emitted).toContainEqual({
      event: "ice-candidate",
      payload: {
        roomId: credentials.roomId,
        candidate: { candidate: "candidate:doctor" },
      },
    });

    await act(async () => {
      mockState.peer.connectionState = "connected";
      mockState.peer.fire("connectionstatechange");
    });
    expect(
      mockState.socket.emitted.filter((e: any) => e.event === "call-connected"),
    ).toHaveLength(0);
    expect(screen.queryByLabelText("Call duration 00:00")).toBeNull();

    await act(async () => {
      mockState.peer.fire("track", {
        streams: [
          {
            toURL: () => "remote:patient",
            getTracks: () => [
              { kind: "audio", readyState: "live" },
              { kind: "video", readyState: "live" },
            ],
          },
        ],
      });
    });
    expect(screen.getByTestId("rtc:remote:patient")).toBeTruthy();
    expect(screen.getAllByText("Connected")).toHaveLength(1);
    expect(screen.getByLabelText("Call duration 00:00")).toBeTruthy();
    expect(
      mockState.socket.emitted.filter((e: any) => e.event === "call-connected"),
    ).toHaveLength(1);
  });

  it("requests a patient ICE restart when the doctor peer fails", async () => {
    render(<VideoConsultation credentials={credentials} patientName="Synthetic patient" onExit={jest.fn()} />);
    await waitFor(() => expect(mockState.socket?.emitted.some((event: any) => event.event === "join-room")).toBe(true));
    await act(async () => {
      mockState.peer.connectionState = "failed";
      mockState.peer.fire("connectionstatechange");
    });
    expect(mockState.socket.emitted.some((event: any) => event.event === "renegotiate")).toBe(true);
    expect(screen.getAllByText("Reconnecting")).toHaveLength(2);
  });

  it("updates real local tracks, switches camera, and confirms call termination", async () => {
    const onExit = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "End call")?.onPress?.();
    });
    render(<VideoConsultation credentials={credentials} patientName="Synthetic patient" onExit={onExit} />);
    await waitFor(() => expect(mockState.socket?.emitted.some((event: any) => event.event === "join-room")).toBe(true));
    fireEvent.press(screen.getByLabelText("Mute microphone"));
    fireEvent.press(screen.getByLabelText("Turn camera off"));
    expect(InCallManager.start).toHaveBeenCalledWith({ media: "video" });
    fireEvent.press(screen.getByLabelText("Switch to earpiece"));
    expect(InCallManager.setForceSpeakerphoneOn).toHaveBeenCalledWith(false);
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByLabelText("Switch camera"));
    expect(screen.getByTestId("call-control-pill")).toBeTruthy();
    expect(mockState.tracks[0].enabled).toBe(false);
    expect(mockState.tracks[1].enabled).toBe(false);
    expect(mockState.tracks[1]._switchCamera).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText("End call"));
    expect(alert).toHaveBeenCalled();
    expect(mockState.socket.emitted.some((event: any) => event.event === "end-call")).toBe(true);
    expect(mockState.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
    expect(screen.getAllByText("Call ended")).toHaveLength(1);
    alert.mockRestore();
  });

  it("shows a permission failure and offers a real retry", async () => {
    mockState.mediaError = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    render(<VideoConsultation credentials={credentials} patientName="Synthetic patient" onExit={jest.fn()} />);
    expect(await screen.findByText(/permission was denied/i)).toBeTruthy();
    mockState.mediaError = null;
    fireEvent.press(screen.getByText("Retry consultation"));
    await waitFor(() => expect(mockState.socket?.emitted.some((event: any) => event.event === "join-room")).toBe(true));
  });
});
