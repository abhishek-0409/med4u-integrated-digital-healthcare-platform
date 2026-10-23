import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Camera, CameraOff, Mic, MicOff, MoreHorizontal, PhoneOff, SwitchCamera, Volume2, VolumeX } from "lucide-react-native";
import InCallManager from "react-native-incall-manager";
import { io, Socket } from "socket.io-client";
import { mediaDevices, MediaStream, RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView } from "react-native-webrtc";
import { env } from "../config/env";
import { ConsultationCredentials } from "../services/consultationApi";
import { colors, round, space, type } from "../theme/tokens";

type CallState = "starting" | "waiting" | "connecting" | "connected" | "reconnecting" | "disconnected" | "failed" | "ended";
type SignalDescription = { sdp: RTCSessionDescription; from: string };
type SignalCandidate = { candidate: RTCIceCandidate; from: string };
type PeerEvents = {
  addEventListener(event: "track", listener: (event: { streams: MediaStream[] }) => void): void;
  addEventListener(event: "icecandidate", listener: (event: { candidate: RTCIceCandidate | null }) => void): void;
  addEventListener(event: "connectionstatechange" | "iceconnectionstatechange", listener: () => void): void;
};
type SwitchableTrack = { _switchCamera?: () => void };

const statusLabel: Record<CallState, string> = {
  starting: "Starting camera and microphone",
  waiting: "Waiting for patient to join",
  connecting: "Connecting audio and video",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  failed: "Call could not connect",
  ended: "Call ended",
};
const durationLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function VideoConsultation({ credentials, patientName, onExit }: { credentials: ConsultationCredentials; patientName: string; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const previewWidth = Math.min(220, Math.max(96, screenWidth * 0.3));
  const previewHeight = previewWidth * 1.42;
  const [status, setStatus] = useState<CallState>("starting");
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speakerAvailable, setSpeakerAvailable] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [retry, setRetry] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const queuedCandidates = useRef<RTCIceCandidate[]>([]);
  const connectedAt = useRef<number | null>(null);
  const connectedReported = useRef(false);
  const joined = useRef(false);
  const ending = useRef(false);
  const socketWasConnected = useRef(false);
  const audioManagerStarted = useRef(false);

  useEffect(() => {
    let disposed = false;
    ending.current = false;
    joined.current = false;
    socketWasConnected.current = false;
    queuedCandidates.current = [];
    connectedAt.current = null;
    connectedReported.current = false;
    setElapsed(0);
    setStatus("starting");
    setError(null);

    const releaseMedia = () => {
      if (audioManagerStarted.current) {
        InCallManager.stop();
        audioManagerStarted.current = false;
      }
      peerRef.current?.close();
      peerRef.current = null;
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
      remoteRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
    };
    const fail = (message: string) => {
      if (disposed || ending.current) return;
      ending.current = true;
      setStatus("failed");
      setError(message);
      if (joined.current) socketRef.current?.emit("leave-room", { roomId: credentials.roomId });
      joined.current = false;
      socketRef.current?.io.off("reconnect_failed");
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      releaseMedia();
    };
    const mediaReady = () => ["audio", "video"].every((kind) =>
      (remoteRef.current?.getTracks() ?? []).some((track) => track.kind === kind && track.readyState === "live"));

    async function start() {
      try {
        if (!env.apiUrl || !credentials.token || !credentials.roomId) throw new Error("Consultation credentials are unavailable.");
        const stream = await mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } });
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
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
          if (audioManagerStarted.current) {
            InCallManager.stop();
            audioManagerStarted.current = false;
          }
        }

        const peer = new RTCPeerConnection({ iceServers: [...credentials.stunServers, ...credentials.turnServers] });
        const events = peer as unknown as PeerEvents;
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        const reportConnected = () => {
          if (peer.connectionState !== "connected" || !mediaReady() || ending.current) return;
          if (connectedAt.current === null) connectedAt.current = Date.now();
          setStatus("connected");
          setError(null);
          if (!connectedReported.current) {
            connectedReported.current = true;
            socketRef.current?.emit("call-connected");
          }
        };
        events.addEventListener("track", (event) => {
          if (disposed || ending.current) return;
          const remote = event.streams[0];
          if (!remote) return;
          remoteRef.current = remote;
          setRemoteStream(remote);
          reportConnected();
        });
        events.addEventListener("icecandidate", (event) => {
          if (event.candidate) socketRef.current?.emit("ice-candidate", { roomId: credentials.roomId, candidate: event.candidate.toJSON() });
        });
        events.addEventListener("connectionstatechange", () => {
          if (disposed || ending.current) return;
          if (peer.connectionState === "connected") reportConnected();
          else if (peer.connectionState === "disconnected") { connectedReported.current = false; setStatus("reconnecting"); }
          else if (peer.connectionState === "failed") {
            connectedReported.current = false;
            setStatus("reconnecting");
            socketRef.current?.emit("renegotiate");
            setError("Network connection interrupted. Trying to reconnect…");
          }
          else if (peer.connectionState === "closed") setStatus("disconnected");
        });
        events.addEventListener("iceconnectionstatechange", () => {
          if (disposed || ending.current) return;
          if (peer.iceConnectionState === "disconnected") { connectedReported.current = false; setStatus("reconnecting"); }
          if (peer.iceConnectionState === "failed") {
            connectedReported.current = false;
            setStatus("reconnecting");
            socketRef.current?.emit("renegotiate");
            setError("Direct network connection failed. Retrying negotiation; TURN may be needed on this network.");
          }
        });

        const socketOrigin = env.apiUrl.replace(/\/api\/?$/, "");
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
          setStatus(socketWasConnected.current ? "reconnecting" : "waiting");
          socketWasConnected.current = true;
          socket.emit("join-room", { roomId: credentials.roomId });
          joined.current = true;
          if (peer.connectionState === "connected" && mediaReady()) reportConnected();
        });
        socket.on("connect_error", () => {
          if (!disposed && !ending.current) { setStatus("reconnecting"); setError("Signaling connection interrupted. Retrying…"); }
        });
        socket.io.on("reconnect_failed", () => fail("Could not reach the signaling service. Check the connection and retry."));
        socket.on("room-ready", () => { if (!disposed && !ending.current) { setStatus("connecting"); setError("Patient joined. Establishing the secure media connection…"); } });
        socket.on("user-joined", () => { if (!disposed && !ending.current) { setStatus("connecting"); setError("Patient joined. Waiting for the video offer…"); } });
        socket.on("offer", async ({ sdp }: SignalDescription) => {
          if (disposed || ending.current || !sdp) return;
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(sdp));
            for (const candidate of queuedCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.emit("answer", { roomId: credentials.roomId, sdp: answer });
            setStatus("connecting");
            setError(null);
          } catch { fail("The patient offer could not be applied. Retry the consultation."); }
        });
        socket.on("ice-candidate", async ({ candidate }: SignalCandidate) => {
          if (!candidate || disposed || ending.current) return;
          try {
            const parsed = new RTCIceCandidate(candidate);
            if (peer.remoteDescription) await peer.addIceCandidate(parsed);
            else queuedCandidates.current.push(parsed);
          } catch { /* Ignore stale candidates; later candidates may still connect. */ }
        });
        socket.on("renegotiate", () => { if (!disposed && !ending.current) { setStatus("reconnecting"); setError("Refreshing the network connection…"); } });
        socket.on("user-left", () => {
          if (!disposed && !ending.current) { setStatus("waiting"); setError("Patient disconnected. Waiting for them to reconnect…"); }
        });
        socket.on("call-ended", () => {
          if (disposed || ending.current) return;
          ending.current = true;
          setStatus("ended");
          setError("The other participant ended the consultation.");
          if (joined.current) socket.emit("leave-room", { roomId: credentials.roomId });
          joined.current = false;
          socket.io.off("reconnect_failed");
          socket.removeAllListeners();
          socket.disconnect();
          releaseMedia();
        });
        socket.on("room-full", () => fail("This consultation already has both participants connected."));
        socket.on("error", (event: { message?: string }) => fail(event?.message ?? "The consultation room rejected the connection."));
        socket.on("disconnect", () => { connectedReported.current = false; if (!disposed && !ending.current) setStatus("reconnecting"); });
        socket.connect();
      } catch (cause) {
        const name = cause instanceof Error ? cause.name : "";
        fail(name === "NotAllowedError" || name === "SecurityError"
          ? "Camera or microphone permission was denied. Allow access in device settings, then retry."
          : cause instanceof Error ? cause.message : "Camera or microphone could not be started.");
      }
    }
    void start();
    return () => {
      disposed = true;
      if (joined.current && !ending.current) socketRef.current?.emit("leave-room", { roomId: credentials.roomId });
      socketRef.current?.io.off("reconnect_failed");
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      joined.current = false;
      queuedCandidates.current = [];
      releaseMedia();
    };
  }, [credentials, retry]);

  useEffect(() => {
    if (!connectedAt.current || (status !== "connected" && status !== "reconnecting")) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - (connectedAt.current ?? Date.now())) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    localRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
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
  const switchCamera = () => localRef.current?.getVideoTracks().forEach((track) => (track as unknown as SwitchableTrack)._switchCamera?.());
  const endCall = () => Alert.alert("End consultation?", "This will disconnect you and the patient.", [
    { text: "Keep call", style: "cancel" },
    { text: "End call", style: "destructive", onPress: () => {
      ending.current = true;
      if (joined.current) socketRef.current?.emit("end-call", { roomId: credentials.roomId });
      joined.current = false;
      socketRef.current?.io.off("reconnect_failed");
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      peerRef.current?.close(); peerRef.current = null;
      localRef.current?.getTracks().forEach((track) => track.stop()); localRef.current = null;
      if (audioManagerStarted.current) { InCallManager.stop(); audioManagerStarted.current = false; }
      remoteRef.current = null;
      connectedAt.current = null;
      setLocalStream(null); setRemoteStream(null); setStatus("ended");
    } },
  ]);
  const retryCall = () => {
    ending.current = false;
    joined.current = false;
    setError(null);
    setRetry((value) => value + 1);
  };

  return (
    <View style={styles.page}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.stage}>
        {remoteStream ? <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} /> : (
          <View style={styles.waiting}>
            {status === "starting" || status === "connecting" || status === "reconnecting" || status === "waiting" ? <ActivityIndicator color={colors.card} /> : <CameraOff size={34} color={colors.sageLight} />}
          </View>
        )}
        {localStream && !cameraOff ? <RTCView streamURL={localStream.toURL()} style={[styles.localVideo, { top: insets.top + 72, width: previewWidth, height: previewHeight }]} objectFit="cover" mirror zOrder={1} /> : null}
        {cameraOff ? <View style={[styles.cameraPaused, { top: insets.top + 72, width: previewWidth, height: previewHeight }]}><CameraOff color={colors.card} /><Text style={styles.waitingHint}>Your camera is off</Text></View> : null}
      </View>
      <View style={[styles.topOverlay, { paddingTop: insets.top + 10, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        <Pressable onPress={status === "failed" || status === "ended" ? onExit : endCall} accessibilityRole="button" accessibilityLabel={status === "failed" || status === "ended" ? "Return to appointment" : "End consultation"} style={styles.backButton}><ArrowLeft color="#fff" size={21} /></Pressable>
        <View style={styles.identity}>
          <Text style={styles.identityName} numberOfLines={1}>{patientName}</Text>
          <View style={styles.statusLine} accessibilityLiveRegion="polite"><View style={[styles.statusDot, status === "connected" && styles.onlineDot, status === "failed" && styles.failedDot]} /><Text style={styles.identityStatus} numberOfLines={1}>{status === "waiting" ? "Waiting for patient to join" : statusLabel[status]}</Text>{connectedAt.current !== null ? <Text style={styles.identityDuration} accessibilityLabel={`Call duration ${durationLabel(elapsed)}`}>{durationLabel(elapsed)}</Text> : null}</View>
        </View>
        <View style={styles.topSpacer} />
      </View>
      {!remoteStream && status !== "failed" && status !== "ended" ? <View pointerEvents="none" style={styles.waitingIdentity}>
        <View style={styles.waitingAvatar}><Text style={styles.waitingInitial}>{patientName.trim().charAt(0).toUpperCase() || "P"}</Text></View>
        <Text style={styles.waitingName}>{patientName}</Text>
        <Text style={styles.waitingHint}>{status === "waiting" ? "Waiting for the patient to join" : statusLabel[status]}</Text>
        {status === "starting" || status === "connecting" || status === "reconnecting" ? <ActivityIndicator color={colors.sageLight} /> : null}
      </View> : null}
      {error ? <Text style={[styles.error, { top: insets.top + 70 }]} accessibilityRole="alert">{error}</Text> : null}
      {status === "failed" || status === "disconnected" || status === "ended" ? (
        <View style={[styles.actions, styles.bottomOverlay, { paddingBottom: insets.bottom + 18 }]}>
          {(status === "failed" || status === "disconnected") ? <Pressable accessibilityRole="button" onPress={retryCall} style={styles.retry}><Text style={styles.retryText}>Retry consultation</Text></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={onExit} style={styles.exit}><Text style={styles.exitText}>Return to appointment</Text></Pressable>
        </View>
      ) : (
        <View style={[styles.dockPosition, { bottom: insets.bottom + 18 }]}>
          {moreOpen ? <View style={styles.moreMenu}>
            <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={() => { switchCamera(); setMoreOpen(false); }} style={styles.menuAction}>
              <SwitchCamera color="#fff" size={18} /><Text style={styles.menuLabel}>Switch camera</Text>
            </Pressable>
          </View> : null}
          <View testID="call-control-pill" style={styles.controlPanel}>
            <View style={styles.controls}>
              <Control label="More options" active={moreOpen} onPress={() => setMoreOpen((open) => !open)}><MoreHorizontal color="#fff" /></Control>
            <Control label={cameraOff ? "Turn camera on" : "Turn camera off"} active={!cameraOff} onPress={toggleCamera}>{cameraOff ? <CameraOff color="#fff" /> : <Camera color="#fff" />}</Control>
            {speakerAvailable ? <Control label={speakerOn ? "Switch to earpiece" : "Switch to speaker"} active={speakerOn} lightActive={speakerOn} onPress={toggleSpeaker}>{speakerOn ? <Volume2 color="#10201b" /> : <VolumeX color="#fff" />}</Control> : null}
              <Control label={muted ? "Unmute microphone" : "Mute microphone"} active={!muted} onPress={toggleMute}>{muted ? <MicOff color="#fff" /> : <Mic color="#fff" />}</Control>
              <Control label="End call" danger onPress={endCall}><PhoneOff color="#fff" /></Control>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function Control({ children, label, onPress, danger = false, active = false, lightActive = false }: React.PropsWithChildren<{ label: string; onPress: () => void; danger?: boolean; active?: boolean; lightActive?: boolean }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, expanded: label === "More options" ? active : undefined }} onPress={onPress} style={({ pressed }) => [styles.control, active && styles.activeControl, lightActive && styles.lightActiveControl, danger && styles.endControl, pressed && styles.pressed]}>{children}</Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#07130f" },
  stage: { ...StyleSheet.absoluteFillObject, overflow: "hidden", justifyContent: "center", backgroundColor: "#102c25" },
  waiting: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  statusDot: { width: 8, height: 8, borderRadius: round.pill, backgroundColor: colors.warning }, onlineDot: { backgroundColor: colors.success }, failedDot: { backgroundColor: colors.danger },
  localVideo: { position: "absolute", right: 16, borderRadius: 18, overflow: "hidden", backgroundColor: colors.forest, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)" },
  cameraPaused: { position: "absolute", right: 16, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#193d32", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)" },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12, backgroundColor: "rgba(4,15,11,0.38)" },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  identity: { flex: 1, gap: 4, alignItems: "center" }, identityName: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" }, statusLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, identityStatus: { color: "rgba(255,255,255,0.84)", fontSize: 12, flexShrink: 1 }, identityDuration: { color: "#fff", fontSize: 12, fontVariant: ["tabular-nums"] }, topSpacer: { width: 42 },
  waitingIdentity: { position: "absolute", top: "36%", left: 24, right: 24, alignItems: "center", gap: 10 }, waitingAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#27634e", alignItems: "center", justifyContent: "center", marginBottom: 4 }, waitingInitial: { color: "#fff", fontSize: 36, fontWeight: "500" }, waitingName: { color: "#fff", fontSize: 22, fontWeight: "600" }, waitingHint: { color: "rgba(255,255,255,0.72)", fontSize: 14, textAlign: "center" },
  error: { position: "absolute", left: 20, right: 20, color: "#fff", backgroundColor: "rgba(100,25,25,0.82)", textAlign: "center", padding: 10, borderRadius: 10 },
  dockPosition: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  controlPanel: { flexDirection: "row", alignItems: "center", padding: 8, gap: 10, borderRadius: round.pill, backgroundColor: "rgba(12,20,18,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  moreMenu: { marginBottom: 10, minWidth: 170, alignSelf: "center", padding: 6, borderRadius: round.md, backgroundColor: "rgba(12,20,18,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" }, menuAction: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 }, menuLabel: { color: "#fff", fontSize: 13 },
  bottomOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center", paddingHorizontal: 16, paddingBottom: 30 },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 }, control: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: round.pill, backgroundColor: "rgba(255,255,255,0.12)" }, activeControl: { backgroundColor: "#27634e" }, lightActiveControl: { backgroundColor: "#fff" }, endControl: { backgroundColor: "#d93642" }, pressed: { opacity: 0.76 },
  actions: { flexDirection: "row", justifyContent: "center", gap: 10 }, retry: { padding: space.sm, borderRadius: round.pill, backgroundColor: colors.green }, retryText: { ...type.caption, color: colors.card, fontWeight: "700" }, exit: { padding: space.sm, borderRadius: round.pill, backgroundColor: colors.sageLight }, exitText: { ...type.caption, color: colors.forest, fontWeight: "700" }, note: { position: "absolute", left: 0, right: 0, ...type.caption, color: "rgba(255,255,255,0.72)", fontSize: 10, textAlign: "center" },
});
