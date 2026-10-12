import { useRef, useState } from "react";
import { getLocalStream, createPeerConnection } from "../services/webrtc";
import { connectSocket } from "../services/socket";

export const useWebRTC = () => {
  const [cameraStarted, setCameraStarted] = useState(false);
  const [remoteVideoStarted, setRemoteVideoStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteUserLeft, setRemoteUserLeft] = useState(false);
  const [roomError, setRoomError] = useState("");

  const peerConnectionRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const socketRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentRoomIdRef = useRef(null);
  const signalingCleanupRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const hasJoinedRoomRef = useRef(false);
  const mediaStartedRef = useRef(false);

  const audioTransceiverRef = useRef(null);
  const videoTransceiverRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraTrackBeforeScreenShareRef = useRef(null);
  const localVideoRefRef = useRef(null);
  const remoteVideoRefRef = useRef(null);

  const initializePeerConnection = (localVideoRef, remoteVideoRef, roomId) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const peerConnection = createPeerConnection();

    peerConnectionRef.current = peerConnection;
    currentRoomIdRef.current = roomId;

    /*
     * Remote media
     */

    peerConnection.ontrack = (event) => {
      console.log("Remote track received:", event.track.kind);

      const stream =
        event.streams?.[0] ??
        (() => {
          if (!remoteStreamRef.current)
            remoteStreamRef.current = new MediaStream();
          const exists = remoteStreamRef.current
            .getTracks()
            .some((t) => t.id === event.track.id);
          if (!exists) remoteStreamRef.current.addTrack(event.track);
          return remoteStreamRef.current;
        })();

      remoteStreamRef.current = stream;

      if (
        remoteVideoRef.current &&
        remoteVideoRef.current.srcObject !== stream
      ) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current
          .play()
          .catch((e) => console.warn("play blocked", e));
      }

      if (event.track.kind === "video") {
        setRemoteVideoStarted(!event.track.muted);

        event.track.onunmute = () => setRemoteVideoStarted(true);
        event.track.onmute = () => setRemoteVideoStarted(false);
        event.track.onended = () => setRemoteVideoStarted(false);
      }
    };

    /*
     * ICE candidates
     */

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      if (!socketRef.current) {
        console.error("Socket not connected");
        return;
      }

      if (!remoteSocketIdRef.current) {
        console.log("Remote socket ID not available yet");
        return;
      }

      socketRef.current.emit("ice-candidate", {
        roomId: currentRoomIdRef.current,
        candidate: event.candidate,
        targetSocketId: remoteSocketIdRef.current,
      });
    };

    console.log("PeerConnection initialized");

    return peerConnection;
  };

  const attachLocalTracks = async (peerConnection, stream) => {
    const audioTrack = stream?.getAudioTracks()[0] ?? null;
    const videoTrack = stream?.getVideoTracks()[0] ?? null;

    const transceivers = peerConnection.getTransceivers();

    const findOrCreate = (kind, track) => {
      let transceiver = transceivers.find(
        (t) => (t.receiver.track?.kind ?? t.sender.track?.kind) === kind,
      );

      if (!transceiver) {
        transceiver = peerConnection.addTransceiver(kind, {
          direction: track ? "sendrecv" : "recvonly",
        });
      } else {
        transceiver.direction = track ? "sendrecv" : "recvonly";
      }

      return transceiver;
    };

    const audioTransceiver = findOrCreate("audio", audioTrack);
    if (audioTrack) await audioTransceiver.sender.replaceTrack(audioTrack);

    const videoTransceiver = findOrCreate("video", videoTrack);
    if (videoTrack) await videoTransceiver.sender.replaceTrack(videoTrack);

    audioTransceiverRef.current = audioTransceiver;
    videoTransceiverRef.current = videoTransceiver;
  };

  const startMedia = async (localVideoRef, remoteVideoRef, roomId, mode) => {
    if (mediaStartedRef.current) {
      console.warn("startMedia called again — ignoring duplicate call");
      return;
    }
    mediaStartedRef.current = true;

    localVideoRefRef.current = localVideoRef;
    remoteVideoRefRef.current = remoteVideoRef;

    try {
      let stream = null;

      /*
       * 1. Get local media
       */

      if (mode === "camera-mic") {
        stream = await getLocalStream({ video: true, audio: true });
      }

      if (mode === "mic-only") {
        stream = await getLocalStream({ video: false, audio: true });
      }

      localStreamRef.current = stream;

      /*
       * 2. Show local media
       */

      if (stream && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      /*
       * 3. Create PeerConnection
       */

      initializePeerConnection(localVideoRef, remoteVideoRef, roomId);

      /*
       * 4. Mic / camera UI state
       */

      const hasAudio = !!stream?.getAudioTracks()[0];
      const hasVideo = !!stream?.getVideoTracks()[0];

      setMicOn(hasAudio);
      setVideoOn(hasVideo);
      setCameraStarted(hasVideo);

      /*
       * 5. Process queued offer if one arrived early
       */

      if (pendingOfferRef.current) {
        console.log("Processing queued offer");

        const { offer, senderId } = pendingOfferRef.current;

        pendingOfferRef.current = null;

        const result = await handleOffer(offer, senderId);

        if (result && socketRef.current) {
          socketRef.current.emit("answer", {
            roomId,
            answer: result.answer,
            targetSocketId: result.senderId,
          });

          console.log("Queued offer answered");
        }
      }

      console.log("Media initialized:", mode);
    } catch (error) {
      console.error("Media initialization error:", error);
      throw error;
    }
  };

  const createOffer = async (roomId) => {
    try {
      if (!peerConnectionRef.current) {
        throw new Error("PeerConnection not created");
      }

      if (!socketRef.current) {
        throw new Error("Socket not connected");
      }

      const offer = await peerConnectionRef.current.createOffer();

      await peerConnectionRef.current.setLocalDescription(offer);

      socketRef.current.emit("offer", { roomId, offer });

      console.log("Offer sent");
    } catch (error) {
      console.error("Offer error:", error);
      throw error;
    }
  };

  const renegotiate = async () => {
    try {
      if (
        !peerConnectionRef.current ||
        !socketRef.current ||
        !currentRoomIdRef.current
      ) {
        return;
      }

      if (peerConnectionRef.current.signalingState !== "stable") {
        console.log("Signaling not stable — skipping renegotiation for now");
        return;
      }

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      socketRef.current.emit("offer", {
        roomId: currentRoomIdRef.current,
        offer,
      });

      console.log("Renegotiation offer sent");
    } catch (error) {
      console.error("Renegotiation error:", error);
    }
  };

  const logTransceivers = (label) => {
    console.log(
      label,
      peerConnectionRef.current.getTransceivers().map((t) => ({
        mid: t.mid,
        kind: t.receiver.track?.kind || t.sender.track?.kind,
        direction: t.direction,
        currentDirection: t.currentDirection,
      })),
    );
  };

  const handleOffer = async (offer, senderId) => {
    try {
      if (!peerConnectionRef.current) {
        console.log("PeerConnection not ready. Queuing offer.");

        pendingOfferRef.current = { offer, senderId };

        return null;
      }

      const peerConnection = peerConnectionRef.current;

      console.log("Offer received from:", senderId);

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer),
      );

      logTransceivers("after SRD offer");

      await attachLocalTracks(peerConnection, localStreamRef.current);

      for (const candidate of pendingIceCandidatesRef.current) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }

      pendingIceCandidatesRef.current = [];

      const answer = await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(answer);

      console.log("Answer created");

      return { answer, senderId };
    } catch (error) {
      console.error("Error handling offer:", error);
      throw error;
    }
  };

  const handleAnswer = async (answer) => {
    try {
      if (!peerConnectionRef.current) {
        throw new Error("PeerConnection not created");
      }

      const peerConnection = peerConnectionRef.current;

      console.log("Answer received");

      if (peerConnection.signalingState !== "have-local-offer") {
        console.log(
          "Ignoring answer because PeerConnection is not waiting for an answer.",
        );

        return;
      }

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer),
      );

      logTransceivers("after SLD answer");

      for (const candidate of pendingIceCandidatesRef.current) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }

      pendingIceCandidatesRef.current = [];

      console.log("Queued ICE candidates added");
    } catch (error) {
      console.error("Error handling answer:", error);
      throw error;
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      if (!peerConnectionRef.current) {
        throw new Error("PeerConnection not created");
      }

      if (!peerConnectionRef.current.remoteDescription) {
        console.log("Remote description not ready. Queuing ICE candidate.");

        pendingIceCandidatesRef.current.push(candidate);

        return;
      }

      await peerConnectionRef.current.addIceCandidate(
        new RTCIceCandidate(candidate),
      );

      console.log("ICE candidate added");
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
      throw error;
    }
  };

  const connect = () => {
    const socket = connectSocket();

    socketRef.current = socket;

    if (socket.connected) {
      console.log("Socket already connected:", socket.id);
    } else {
      socket.once("connect", () => {
        console.log("Socket connected:", socket.id);
      });
    }

    return socket;
  };

  const setupSignaling = ({ roomId, onRoomJoined }) => {
    let socket = socketRef.current;

    if (signalingCleanupRef.current) {
      signalingCleanupRef.current();
      signalingCleanupRef.current = null;
    }

    if (!socket) {
      socket = connectSocket();
      socketRef.current = socket;
    }

    const handleUserConnected = async (data) => {
      try {
        console.log("Another user joined:", data);

        setRemoteUserLeft(false);
        setRemoteSocketId(data.socketId);

        if (!peerConnectionRef.current) {
          initializePeerConnection(
            localVideoRefRef.current,
            remoteVideoRefRef.current,
            currentRoomIdRef.current,
          );
        }

        if (peerConnectionRef.current.signalingState !== "stable") {
          console.log("PeerConnection is not stable. Skipping offer.");
          return;
        }

        await attachLocalTracks(
          peerConnectionRef.current,
          localStreamRef.current,
        );

        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);

        logTransceivers("after userconnected");

        socket.emit("offer", { roomId, offer });

        console.log("Offer automatically sent");
      } catch (error) {
        console.error("Automatic offer error:", error);
      }
    };

    const handleRoomError = ({ message }) => {
      console.log("Room error:", message);
      setRoomError(message || "Room not found");
      abortJoin();
    };

    socket.on("room-error", handleRoomError);

    const handleOfferEvent = async ({ offer, senderId }) => {
      try {
        setRemoteUserLeft(false);

        const result = await handleOffer(offer, senderId);

        if (!result) return;

        socket.emit("answer", {
          roomId,
          answer: result.answer,
          targetSocketId: result.senderId,
        });

        console.log("Answer sent");
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    const handleAnswerEvent = async ({ answer }) => {
      try {
        await handleAnswer(answer);
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    };

    const handleIceCandidateEvent = async ({ candidate, senderId }) => {
      try {
        console.log("ICE candidate received from:", senderId);
        await handleIceCandidate(candidate);
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    };

    const handleRoomJoined = (data) => {
      console.log("Room joined:", data);

      const remoteSocketId = data.participants.find(
        (id) => id !== data.socketId,
      );

      if (remoteSocketId) {
        setRemoteSocketId(remoteSocketId);
      }

      if (onRoomJoined) {
        onRoomJoined(data);
      }
    };

    // Fired when the OTHER participant leaves (explicit end call or disconnect)
    const handleUserDisconnected = ({ socketId }) => {
      console.log("Remote user disconnected:", socketId);

      if (remoteSocketIdRef.current === socketId) {
        remoteSocketIdRef.current = null;
      }

      if (remoteVideoRefRef.current?.current) {
        remoteVideoRefRef.current.current.srcObject = null;
      }

      remoteStreamRef.current = null;
      setRemoteVideoStarted(false);
      setRemoteUserLeft(true);

      // Fully close the old connection so the next participant gets a clean slate.
      // Your camera/mic stream itself is left untouched — only the peer link resets.
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      audioTransceiverRef.current = null;
      videoTransceiverRef.current = null;
      pendingIceCandidatesRef.current = [];
      pendingOfferRef.current = null;
    };

    socket.on("user-connected", handleUserConnected);
    socket.on("offer", handleOfferEvent);
    socket.on("answer", handleAnswerEvent);
    socket.on("ice-candidate", handleIceCandidateEvent);
    socket.on("room-joined", handleRoomJoined);
    socket.on("user-disconnected", handleUserDisconnected);

    const cleanup = () => {
      socket.off("user-connected", handleUserConnected);
      socket.off("offer", handleOfferEvent);
      socket.off("answer", handleAnswerEvent);
      socket.off("ice-candidate", handleIceCandidateEvent);
      socket.off("room-joined", handleRoomJoined);
      socket.off("user-disconnected", handleUserDisconnected);
      socket.off("room-error", handleRoomError);
    };

    signalingCleanupRef.current = cleanup;

    return cleanup;
  };

  const abortJoin = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    socketRef.current?.disconnect();
    socketRef.current = null;

    hasJoinedRoomRef.current = false;
    mediaStartedRef.current = false;
    currentRoomIdRef.current = null;

    setMicOn(false);
    setVideoOn(false);
    setCameraStarted(false);
  };

  const joinRoom = (roomId, onRoomJoined) => {
    if (hasJoinedRoomRef.current) {
      console.log("Already joined a room. Skipping duplicate join.");
      return;
    }

    hasJoinedRoomRef.current = true;

    let socket = socketRef.current;

    if (!socket) {
      socket = connectSocket();
      socketRef.current = socket;
    }

    setupSignaling({ roomId, onRoomJoined });

    const handleJoin = () => {
      console.log("Joining room:", roomId);
      socket.emit("join-room", { roomId });
    };

    if (socket.connected) {
      handleJoin();
    } else {
      socket.once("connect", handleJoin);
    }
  };

  const setRemoteSocketId = (socketId) => {
    remoteSocketIdRef.current = socketId;
    console.log("Remote socket ID:", socketId);
  };

  /*
   * ---------- In-call controls ----------
   */

  const toggleMic = async () => {
    try {
      const existingTrack = localStreamRef.current?.getAudioTracks()[0];

      if (existingTrack) {
        existingTrack.enabled = !existingTrack.enabled;
        setMicOn(existingTrack.enabled);
        return;
      }

      const newStream = await getLocalStream({ audio: true, video: false });
      const newTrack = newStream.getAudioTracks()[0];

      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      localStreamRef.current.addTrack(newTrack);

      if (audioTransceiverRef.current) {
        await audioTransceiverRef.current.sender.replaceTrack(newTrack);
        audioTransceiverRef.current.direction = "sendrecv";
      }

      setMicOn(true);
      await renegotiate();
    } catch (error) {
      console.error("Toggle mic error:", error);
    }
  };

  const toggleCamera = async () => {
    try {
      if (screenSharing) {
        console.warn("Stop screen share before toggling camera");
        return;
      }

      const existingTrack = localStreamRef.current?.getVideoTracks()[0];

      if (existingTrack) {
        existingTrack.enabled = !existingTrack.enabled;
        setVideoOn(existingTrack.enabled);
        setCameraStarted(existingTrack.enabled);
        return;
      }

      const newStream = await getLocalStream({ video: true, audio: false });
      const newTrack = newStream.getVideoTracks()[0];

      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      localStreamRef.current.addTrack(newTrack);

      if (localVideoRefRef.current?.current) {
        localVideoRefRef.current.current.srcObject = localStreamRef.current;
        localVideoRefRef.current.current.play().catch(() => {});
      }

      if (videoTransceiverRef.current) {
        await videoTransceiverRef.current.sender.replaceTrack(newTrack);
        videoTransceiverRef.current.direction = "sendrecv";
      }

      setVideoOn(true);
      setCameraStarted(true);
      await renegotiate();
    } catch (error) {
      console.error("Toggle camera error:", error);
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const screenTrack = screenStream.getVideoTracks()[0];

      cameraTrackBeforeScreenShareRef.current =
        localStreamRef.current?.getVideoTracks()[0] ?? null;

      if (videoTransceiverRef.current) {
        await videoTransceiverRef.current.sender.replaceTrack(screenTrack);
        videoTransceiverRef.current.direction = "sendrecv";
      }

      if (localVideoRefRef.current?.current) {
        localVideoRefRef.current.current.srcObject = new MediaStream([
          screenTrack,
        ]);
      }

      screenTrack.onended = () => stopScreenShare();

      screenStreamRef.current = screenStream;
      setScreenSharing(true);
      setVideoOn(true);
      setCameraStarted(true);
    } catch (error) {
      console.error("Screen share error:", error);
    }
  };

  const stopScreenShare = async () => {
    const camTrack = cameraTrackBeforeScreenShareRef.current;

    if (videoTransceiverRef.current) {
      await videoTransceiverRef.current.sender.replaceTrack(camTrack ?? null);
      videoTransceiverRef.current.direction = camTrack
        ? "sendrecv"
        : "recvonly";
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    if (localVideoRefRef.current?.current && localStreamRef.current) {
      localVideoRefRef.current.current.srcObject = localStreamRef.current;
    }

    setScreenSharing(false);
    setVideoOn(!!camTrack && camTrack.enabled);
    setCameraStarted(!!camTrack && camTrack.enabled);
  };

  const endCall = () => {
    if (socketRef.current && currentRoomIdRef.current) {
      socketRef.current.emit("leave-room", {
        roomId: currentRoomIdRef.current,
      });
    }

    if (signalingCleanupRef.current) {
      signalingCleanupRef.current();
      signalingCleanupRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    socketRef.current?.disconnect();
    socketRef.current = null;

    hasJoinedRoomRef.current = false;
    mediaStartedRef.current = false;
    remoteStreamRef.current = null;
    localStreamRef.current = null;
    currentRoomIdRef.current = null;
    remoteSocketIdRef.current = null;
    audioTransceiverRef.current = null;
    videoTransceiverRef.current = null;
    pendingIceCandidatesRef.current = [];
    pendingOfferRef.current = null;

    setMicOn(false);
    setVideoOn(false);
    setScreenSharing(false);
    setCameraStarted(false);
    setRemoteVideoStarted(false);
    setRemoteUserLeft(false);
  };

  return {
    cameraStarted,
    remoteVideoStarted,
    micOn,
    videoOn,
    screenSharing,
    remoteUserLeft,

    peerConnectionRef,
    remoteSocketIdRef,
    socketRef,
    localStreamRef,
    remoteStreamRef,

    startMedia,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    setRemoteSocketId,
    connect,
    setupSignaling,
    joinRoom,

    toggleMic,
    toggleCamera,
    toggleScreenShare,
    endCall,
    roomError,
    setRoomError,
  };
};
