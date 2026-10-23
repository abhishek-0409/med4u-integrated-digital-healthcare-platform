import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  RefreshCw,
  SwitchCamera,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import InCallManager from "react-native-incall-manager";
import { io, Socket } from "socket.io-client";
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCView,
} from "react-native-webrtc";
import { env } from "../../config/env";
import type { IceServer } from "../../services/consultation.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { VideoCallProps } from "./VideoCall";

type CallState =
  "waiting" | "connecting" | "connected" | "reconnecting" | "failed" | "ended";
type SignalDescription = { sdp: RTCSessionDescription; from: string };
type SignalCandidate = { candidate: RTCIceCandidate; from: string };
type CallEnded = { reason?: string };
type PeerEvents = {
  addEventListener(
    event: "track",
    listener: (event: { streams: MediaStream[] }) => void,
  ): void;
  addEventListener(
    event: "icecandidate",
    listener: (event: { candidate: RTCIceCandidate | null }) => void,
  ): void;
  addEventListener(
    event: "connectionstatechange" | "iceconnectionstatechange",
    listener: () => void,
  ): void;
};

const statusLabels: Record<CallState, string> = {
  waiting: "Waiting for the other participant",
  connecting: "Connecting securely…",
  connected: "Connected",
  reconnecting: "Network interrupted. Reconnecting…",
  failed: "Could not connect the call",
  ended: "Call ended",
};

export function VideoCall({
  appointmentId,
  displayName,
  doctorName,
  doctorSpecialization,
  doctorId,
  doctorAvatarUrl,
  doctorGender,
  doctorIsDemo,
  isPatient,
  credentials,
  onExit,
}: VideoCallProps) {
  const [callState, setCallState] = useState<CallState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speakerAvailable, setSpeakerAvailable] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [retry, setRetry] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const connectedAt = useRef<number | null>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const previewWidth = Math.min(220, Math.max(96, screenWidth * 0.3));
  const previewHeight = previewWidth * 1.42;
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const candidateQueue = useRef<RTCIceCandidate[]>([]);
  const joinedRef = useRef(false);
  const endingRef = useRef(false);
  const offerRef = useRef(false);
  const connectedSentRef = useRef(false);
  const iceRestartRef = useRef(false);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartOfferRef = useRef<(() => Promise<void>) | null>(null);
  const audioManagerStarted = useRef(false);

  const stopCallAudio = useCallback(() => {
    if (!audioManagerStarted.current) return;
    InCallManager.stop();
    audioManagerStarted.current = false;
  }, []);

  const releaseMedia = useCallback(() => {
    stopCallAudio();
    peerRef.current?.close();
    peerRef.current = null;
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    remoteRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, [stopCallAudio]);

  useEffect(() => {
    let disposed = false;
    const socketOrigin = env.apiUrl.replace(/\/api\/?$/, "");
    const iceServers: IceServer[] = [
      ...credentials.stunServers,
      ...credentials.turnServers,
    ];
    const failCall = (message: string) => {
      setCallState("failed");
      setError(message);
      endingRef.current = true;
      if (joinedRef.current)
        socketRef.current?.emit("leave-room", { roomId: credentials.roomId });
      joinedRef.current = false;
      socketRef.current?.io.off("reconnect_failed");
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      releaseMedia();
    };
    const reportConnectedWhenMediaReady = (peer: RTCPeerConnection) => {
      const tracks = remoteRef.current?.getTracks() ?? [];
      const hasAudioAndVideo = ["audio", "video"].every((kind) =>
        tracks.some(
          (track) => track.kind === kind && track.readyState === "live",
        ),
      );
      if (
        peer.connectionState !== "connected" ||
        !hasAudioAndVideo ||
        endingRef.current
      )
        return;
      setCallState("connected");
      if (connectedAt.current === null) connectedAt.current = Date.now();
      setError(null);
      if (!connectedSentRef.current) {
        connectedSentRef.current = true;
        socketRef.current?.emit("call-connected");
      }
    };

    async function start() {
      try {
        if (
          !socketOrigin ||
          !credentials.token ||
          credentials.roomId !== appointmentId
        ) {
          throw new Error(
            "Consultation service is not configured for this appointment.",
          );
        }
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user" },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localRef.current = stream;
        setLocalStream(stream);
        try {
          InCallManager.start({ media: "video" });
          audioManagerStarted.current = true;
          InCallManager.setForceSpeakerphoneOn(true);
          setSpeakerOn(true);
          setSpeakerAvailable(true);
        } catch {
          setSpeakerAvailable(false);
          stopCallAudio();
        }

        const peer = new RTCPeerConnection({ iceServers });
        const peerEvents = peer as unknown as PeerEvents;
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        peerEvents.addEventListener("track", (event) => {
          const remote = event.streams[0];
          if (remote) {
            remoteRef.current = remote;
            setRemoteStream(remote);
            reportConnectedWhenMediaReady(peer);
          }
        });
        peerEvents.addEventListener("icecandidate", (event) => {
          if (event.candidate)
            socketRef.current?.emit("ice-candidate", {
              roomId: credentials.roomId,
              candidate: event.candidate.toJSON(),
            });
        });
        peerEvents.addEventListener("connectionstatechange", () => {
          if (disposed || endingRef.current) return;
          if (peer.connectionState === "connected") {
            reportConnectedWhenMediaReady(peer);
          } else if (peer.connectionState === "disconnected") {
            connectedSentRef.current = false;
            setCallState("reconnecting");
          } else if (peer.connectionState === "failed") {
            connectedSentRef.current = false;
            setCallState("reconnecting");
            setError("Network interrupted. Restarting the secure connection…");
            if (isPatient && restartOfferRef.current) {
              iceRestartRef.current = true;
              offerRef.current = false;
              void restartOfferRef.current();
            }
          }
        });
        peerEvents.addEventListener("iceconnectionstatechange", () => {
          if (!disposed && peer.iceConnectionState === "failed") {
            connectedSentRef.current = false;
            setCallState("reconnecting");
            setError("Direct connection failed. Restarting ICE; TURN may be needed on this network.");
            if (isPatient && restartOfferRef.current) {
              iceRestartRef.current = true;
              offerRef.current = false;
              void restartOfferRef.current();
            } else if (!isPatient) socketRef.current?.emit("renegotiate");
          }
        });

        const socket = io(socketOrigin, {
          autoConnect: false,
          auth: { token: credentials.token },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          timeout: 12000,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setCallState("waiting");
          waitingTimerRef.current = setTimeout(() => {
            if (!offerRef.current && !endingRef.current) {
              failCall(
                "The other participant did not join. You can retry or return to your appointment.",
              );
            }
          }, 90_000);
          socket.emit("join-room", { roomId: credentials.roomId });
          joinedRef.current = true;
          if (peer.connectionState === "connected") reportConnectedWhenMediaReady(peer);
        });
        const startOffer = async () => {
          if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
          if (!isPatient) return;
          const activePeer = peerRef.current;
          if (!activePeer || offerRef.current || endingRef.current) return;
          try {
            offerRef.current = true;
            const offer = await activePeer.createOffer({
              iceRestart: iceRestartRef.current,
            });
            await activePeer.setLocalDescription(offer);
            socket.emit("offer", { roomId: credentials.roomId, sdp: offer });
            iceRestartRef.current = false;
            setCallState("connecting");
          } catch {
            offerRef.current = false;
            failCall("Could not start call negotiation. Please retry.");
          }
        };
        restartOfferRef.current = startOffer;
        socket.on("user-joined", () => {
          void startOffer();
        });
        socket.on("room-ready", () => {
          void startOffer();
        });
        socket.on("renegotiate", () => {
          if (endingRef.current) return;
          iceRestartRef.current = true;
          offerRef.current = false;
          void startOffer();
        });
        socket.on("offer", async ({ sdp }: SignalDescription) => {
          if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
          const activePeer = peerRef.current;
          if (!activePeer || !sdp || endingRef.current) return;
          try {
            await activePeer.setRemoteDescription(
              new RTCSessionDescription(sdp),
            );
            for (const queued of candidateQueue.current.splice(0))
              await activePeer.addIceCandidate(queued);
            const answer = await activePeer.createAnswer();
            await activePeer.setLocalDescription(answer);
            socket.emit("answer", { roomId: credentials.roomId, sdp: answer });
            setCallState("connecting");
          } catch {
            failCall(
              "The other participant's call offer could not be accepted.",
            );
          }
        });
        socket.on("answer", async ({ sdp }: SignalDescription) => {
          const activePeer = peerRef.current;
          if (!activePeer || !sdp || endingRef.current) return;
          try {
            await activePeer.setRemoteDescription(
              new RTCSessionDescription(sdp),
            );
            for (const queued of candidateQueue.current.splice(0))
              await activePeer.addIceCandidate(queued);
          } catch {
            failCall("The call response could not be applied.");
          }
        });
        socket.on("ice-candidate", async ({ candidate }: SignalCandidate) => {
          const activePeer = peerRef.current;
          if (!activePeer || !candidate || endingRef.current) return;
          try {
            const parsed = new RTCIceCandidate(candidate);
            if (activePeer.remoteDescription)
              await activePeer.addIceCandidate(parsed);
            else candidateQueue.current.push(parsed);
          } catch {
            // A malformed or stale candidate is ignored; other candidates can still connect.
          }
        });
        socket.on("call-ended", (_event: CallEnded) => {
          endingRef.current = true;
          if (joinedRef.current) socket.emit("leave-room", { roomId: credentials.roomId });
          joinedRef.current = false;
          socket.io.off("reconnect_failed");
          socket.removeAllListeners();
          socket.disconnect();
          setCallState("ended");
          releaseMedia();
        });
        socket.on("user-left", () => {
          if (!endingRef.current) {
            iceRestartRef.current = true;
            offerRef.current = false;
            setCallState("reconnecting");
          }
        });
        socket.on("room-full", () => {
          failCall(
            "This consultation already has both participants connected.",
          );
        });
        socket.on("error", (event: { message?: string }) => {
          failCall(
            event?.message ?? "The consultation room rejected the connection.",
          );
        });
        socket.on("connect_error", () => {
          if (!disposed) {
            setCallState("reconnecting");
            setError("The signaling service is unavailable. Retrying…");
          }
        });
        socket.io.on("reconnect_failed", () => {
          if (!disposed)
            failCall(
              "The signaling service could not be reached. Check your connection and retry.",
            );
        });
        socket.on("disconnect", () => {
          if (!disposed && !endingRef.current) {
            connectedSentRef.current = false;
            iceRestartRef.current = true;
            offerRef.current = false;
            setCallState("reconnecting");
          }
        });
        socket.connect();
      } catch (cause) {
        if (disposed) return;
        const name = cause instanceof Error ? cause.name : "";
        failCall(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera or microphone permission was denied. Allow access in your device settings, then retry."
            : cause instanceof Error
              ? cause.message
              : "Camera and microphone could not be started.",
        );
      }
    }

    void start();
    return () => {
      disposed = true;
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
      if (joinedRef.current && !endingRef.current)
        socketRef.current?.emit("leave-room", { roomId: credentials.roomId });
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      joinedRef.current = false;
      candidateQueue.current = [];
      restartOfferRef.current = null;
      releaseMedia();
    };
  }, [appointmentId, credentials, isPatient, releaseMedia, retry, stopCallAudio]);

  useEffect(() => {
    if (connectedAt.current === null || (callState !== "connected" && callState !== "reconnecting")) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - (connectedAt.current ?? Date.now())) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [callState]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        const active = state === "active";
        setForeground(active);
        localRef.current?.getTracks().forEach((track) => {
          track.enabled =
            active && (track.kind === "audio" ? !muted : !cameraOff);
        });
      },
    );
    return () => subscription.remove();
  }, [muted, cameraOff]);

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next && foreground;
    });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    localRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next && foreground;
    });
    setCameraOff(next);
  };
  const toggleSpeaker = () => {
    const next = !speakerOn;
    try {
      InCallManager.setForceSpeakerphoneOn(next);
      setSpeakerOn(next);
    } catch {
      setSpeakerAvailable(false);
    }
  };
  const switchCamera = () =>
    localRef.current
      ?.getVideoTracks()
      .forEach((track) => track._switchCamera());
  const retryCall = () => {
    endingRef.current = false;
    connectedAt.current = null;
    setElapsed(0);
    offerRef.current = false;
    connectedSentRef.current = false;
    joinedRef.current = false;
    setError(null);
    setCallState("connecting");
    setRetry((value) => value + 1);
  };
  const endCall = () => {
    Alert.alert(
      "End consultation?",
      "This will disconnect you from the doctor.",
      [
        { text: "Keep call", style: "cancel" },
        {
          text: "End call",
          style: "destructive",
          onPress: () => {
            endingRef.current = true;
            socketRef.current?.emit("end-call");
            joinedRef.current = false;
            socketRef.current?.io.off("reconnect_failed");
            socketRef.current?.removeAllListeners();
            socketRef.current?.disconnect();
            socketRef.current = null;
            setCallState("ended");
            releaseMedia();
          },
        },
      ],
    );
  };

  const remoteUrl = remoteStream?.toURL();
  const localUrl = localStream?.toURL();
  const statusColor =
    callState === "connected"
      ? colors.success
      : callState === "failed"
        ? colors.danger
        : colors.warning;
  const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.videoStage}>
        {remoteUrl ? (
          <RTCView
            streamURL={remoteUrl}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            zOrder={0}
          />
        ) : null}
        {localUrl && !cameraOff ? (
          <RTCView
            streamURL={localUrl}
            style={[styles.localVideo, { top: insets.top + 72, width: previewWidth, height: previewHeight }]}
            mirror
            objectFit="cover"
            zOrder={1}
          />
        ) : null}
        {cameraOff || !foreground ? (
            <View style={[styles.cameraPaused, { top: insets.top + 72, width: previewWidth, height: previewHeight }]}>
            <CameraOff color={colors.white} size={20} />
            <Text style={styles.pausedText}>Camera off</Text>
          </View>
        ) : null}
        {callState === "failed" && error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {!foreground ? (
          <View style={styles.backgroundBox}>
            <Text style={styles.backgroundText}>
              Camera and microphone paused while app is in the background.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.topOverlay, { paddingTop: insets.top + 10, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        <Pressable onPress={callState === "failed" || callState === "ended" ? onExit : endCall} accessibilityRole="button" accessibilityLabel={callState === "failed" || callState === "ended" ? "Return to appointment" : "End consultation"} style={styles.backButton}>
          <ArrowLeft color="#fff" size={21} />
        </Pressable>
        <View style={styles.identity}>
          <Text style={styles.identityName} numberOfLines={1}>{doctorName}</Text>
          <View style={styles.statusLine} accessibilityLiveRegion="polite">
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.identityStatus} numberOfLines={1}>{callState === "waiting" ? `Waiting for ${displayName}` : statusLabels[callState]}</Text>
            {connectedAt.current !== null ? <Text style={styles.identityDuration} accessibilityLabel={`Call duration ${elapsedLabel}`}>{elapsedLabel}</Text> : null}
          </View>
        </View>
        <View style={styles.topSpacer} />
      </View>
      {!remoteUrl && callState !== "failed" && callState !== "ended" ? (
        <View pointerEvents="none" style={styles.waitingIdentity}>
          <View style={styles.waitingAvatar}><Text style={styles.waitingInitial}>{doctorName.trim().charAt(0).toUpperCase() || "M"}</Text></View>
          <Text style={styles.waitingName}>{doctorName}</Text>
          <Text style={styles.waitingHint}>{callState === "waiting" ? `Waiting for ${displayName} to join` : statusLabels[callState]}</Text>
          {callState === "connecting" || callState === "waiting" || callState === "reconnecting" ? <ActivityIndicator color={colors.lightSage} size="small" /> : null}
        </View>
      ) : null}

      {callState === "failed" ? (
        <View style={[styles.controls, styles.bottomOverlay, { paddingBottom: insets.bottom + 18 }]}>
          <ActionButton label="Try again" onPress={retryCall}>
            <RefreshCw color={colors.primaryDark} size={20} />
          </ActionButton>
          <ActionButton label="Return" onPress={onExit} danger>
            <PhoneOff color={colors.white} size={20} />
          </ActionButton>
        </View>
      ) : callState === "ended" ? (
        <View style={[styles.endedCard, styles.bottomOverlay, { paddingBottom: insets.bottom + 18 }]}>
          <Text style={styles.endedTitle}>Consultation ended</Text>
          <ActionButton label="Return to appointment" onPress={onExit}>
            <PhoneOff color={colors.white} size={20} />
          </ActionButton>
        </View>
      ) : (
        <View style={[styles.dockPosition, { bottom: insets.bottom + 18 }]}>
          {moreOpen ? (
            <View style={styles.moreMenu}>
              <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={() => { switchCamera(); setMoreOpen(false); }} style={styles.menuAction}>
                <SwitchCamera color="#fff" size={18} />
                <Text style={styles.menuLabel}>Switch camera</Text>
              </Pressable>
            </View>
          ) : null}
          <View testID="call-control-pill" style={styles.controlPanel}>
          <View style={styles.controls}>
            <ActionButton label="More options" active={moreOpen} onPress={() => setMoreOpen((open) => !open)}>
              <MoreHorizontal color="#fff" size={22} />
            </ActionButton>
            <ActionButton label={cameraOff ? "Turn camera on" : "Turn camera off"} active={!cameraOff} onPress={toggleCamera}>
              {cameraOff ? <CameraOff color="#fff" size={21} /> : <Camera color="#fff" size={21} />}
            </ActionButton>
            {speakerAvailable ? <ActionButton label={speakerOn ? "Switch to earpiece" : "Switch to speaker"} active={speakerOn} lightActive={speakerOn} onPress={toggleSpeaker}>
              {speakerOn ? <Volume2 color="#10201b" size={22} /> : <VolumeX color="#fff" size={22} />}
            </ActionButton> : null}
            <ActionButton label={muted ? "Unmute microphone" : "Mute microphone"} active={!muted} onPress={toggleMute}>
              {muted ? <MicOff color="#fff" size={21} /> : <Mic color="#fff" size={21} />}
            </ActionButton>
            <ActionButton label="End call" onPress={endCall} danger>
              <PhoneOff color="#fff" size={21} />
            </ActionButton>
          </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ActionButton({
  children,
  label,
  onPress,
  danger = false,
  active = false,
  lightActive = false,
}: React.PropsWithChildren<{
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  lightActive?: boolean;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.activeButton,
        lightActive && styles.lightActiveButton,
        danger && styles.danger,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#07130f" },
  videoStage: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: "#102c25",
    justifyContent: "center",
  },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12, backgroundColor: "rgba(4,15,11,0.28)" },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  identity: { flex: 1, gap: 4, alignItems: "center" },
  identityName: { ...typography.bodyBold, color: "#fff", fontSize: 16, textAlign: "center" },
  statusLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  identityStatus: { color: "rgba(255,255,255,0.84)", fontSize: 12, flexShrink: 1 },
  identityDuration: { color: "#fff", fontSize: 12, fontVariant: ["tabular-nums"] },
  topSpacer: { width: 42 },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill },
  waitingIdentity: { position: "absolute", top: "36%", left: 24, right: 24, alignItems: "center", gap: 10 },
  waitingAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#27634e", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  waitingInitial: { color: "#fff", fontSize: 36, fontWeight: "500" },
  waitingName: { color: "#fff", fontSize: 22, fontWeight: "600" },
  waitingHint: { color: "rgba(255,255,255,0.72)", fontSize: 14, textAlign: "center" },
  localVideo: {
    position: "absolute",
    top: 110,
    right: 16,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#27634e",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  cameraPaused: {
    position: "absolute",
    top: 110,
    right: 16,
    borderRadius: 18,
    backgroundColor: "#193d32",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  pausedText: { ...typography.caption, color: "#fff" },
  errorBox: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(16,44,37,0.9)",
  },
  errorText: { ...typography.body, color: colors.white, textAlign: "center" },
  backgroundBox: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(16,44,37,0.9)",
  },
  backgroundText: {
    ...typography.caption,
    color: colors.white,
    textAlign: "center",
  },
  dockPosition: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bottomOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center", paddingHorizontal: 16, paddingBottom: 30 },
  controlPanel: { flexDirection: "row", alignItems: "center", padding: 8, gap: 8, borderRadius: radius.pill, backgroundColor: "rgba(12,20,18,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  moreMenu: { marginBottom: 10, minWidth: 170, alignSelf: "center", padding: 6, borderRadius: radius.lg, backgroundColor: "rgba(12,20,18,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  menuAction: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  menuLabel: { color: "#fff", fontSize: 13 },
  controls: { flexDirection: "row", alignItems: "center", gap: 10 },
  button: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  activeButton: { backgroundColor: "#27634e" },
  lightActiveButton: { backgroundColor: "#fff" },
  danger: { backgroundColor: "#d93642" },
  pressed: { opacity: 0.8 },
  endedCard: {
    backgroundColor: "rgba(4,15,11,0.88)",
    borderRadius: radius.lg,
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  endedTitle: { ...typography.title, color: "#fff" },
});
