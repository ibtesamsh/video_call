import { useRef, useState, useEffect } from "react";
import { createRoom, checkRoomExists } from "./services/api";
import { useWebRTC } from "./hooks/useWebRTC";
import "./App.css";

const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  return /android|iphone|ipad|ipod|iemobile|blackberry|opera mini/i.test(ua);
};

function App() {
  const [roomId, setRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState("");
  const [inCall, setInCall] = useState(false);
  const [isMobile] = useState(isMobileDevice());
  const screenShareSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia;
  const {
    cameraStarted,
    remoteVideoStarted,
    micOn,
    videoOn,
    screenSharing,
    remoteUserLeft,
    roomError,
    setRoomError,
    startMedia,
    joinRoom,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    endCall,
  } = useWebRTC();

  useEffect(() => {
    if (roomError) {
      setError(roomError);
      setInCall(false);
      setRoomError("");
    }
  }, [roomError, setRoomError]);

  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const handleCreateRoom = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await createRoom();

      setRoomId(data.roomId);
    } catch (error) {
      console.error(error);
      setError("Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomId) {
      setError("Create a room first");
      return;
    }

    setError("");
    setLoading(true);

    const exists = await checkRoomExists(roomId);

    setLoading(false);

    if (!exists) {
      setError("This room no longer exists. Create a new one.");
      setRoomId("");
      return;
    }

    setPendingRoomId(roomId);
    setShowMediaModal(true);
  };

  const handleJoinExistingRoom = async () => {
    const trimmed = joinRoomId.trim();

    if (!trimmed) {
      setError("Enter a Room ID");
      return;
    }

    setError("");
    setLoading(true);

    const exists = await checkRoomExists(trimmed);

    setLoading(false);

    if (!exists) {
      setError("Room not found. Check the ID or ask for a new one.");
      return;
    }

    setPendingRoomId(trimmed);
    setShowMediaModal(true);
  };

  const handleMediaChoice = async (mode) => {
    try {
      setError("");
      setShowMediaModal(false);

      await startMedia(videoRef, remoteVideoRef, pendingRoomId, mode);

      joinRoom(pendingRoomId);

      setInCall(true);
    } catch (error) {
      console.error("Media access error:", error);
      setError("Unable to access your selected camera or microphone.");
    }
  };

  const handleEndCall = () => {
    endCall();
    setInCall(false);
    setRoomId("");
    setJoinRoomId("");
    setPendingRoomId("");
  };

  const copyRoomId = async () => {
    if (!roomId) return;

    if (!navigator.clipboard) {
      setError("Clipboard requires HTTPS. Copy the ID manually.");
      return;
    }

    try {
      await navigator.clipboard.writeText(roomId);
    } catch (error) {
      console.error("Failed to copy room ID:", error);
    }
  };

  return (
    <div className="app">
      <header className="navbar">
        <div className="brand">
          <div className="brand-icon">V</div>
          <span>VideoCall</span>
        </div>

        <div className="connection-status">
          <span className="status-dot" />
          <span>Ready</span>
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div className="hero-text">
            <span className="eyebrow">PRIVATE VIDEO CALL</span>

            <h1>
              Connect face to face,
              <br />
              <span>from anywhere.</span>
            </h1>

            <p>
              Create a private room and start a secure peer-to-peer video
              conversation in seconds.
            </p>
          </div>

          <div className="video-section">
            <div className="remote-video-container">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="remote-video"
              />

              {!remoteVideoStarted && !remoteUserLeft && (
                <div className="video-placeholder">
                  <div className="placeholder-icon">◉</div>
                  <h3>Waiting for connection</h3>
                  <p>Your remote video will appear here</p>
                </div>
              )}

              {remoteUserLeft && (
                <div className="video-placeholder left-placeholder">
                  <div className="placeholder-icon">⦸</div>
                  <h3>User has left the call</h3>
                  <p>The other participant disconnected</p>
                </div>
              )}

              <div className="remote-label">Remote</div>

              <div className="local-video-container">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="local-video"
                />

                {!cameraStarted && (
                  <div className="local-placeholder">
                    <span>YOU</span>
                  </div>
                )}

                <span className="local-label">You</span>
              </div>
            </div>

            {inCall && (
              <div className="call-controls">
                <button
                  className={`control-button ${micOn ? "active" : ""}`}
                  onClick={toggleMic}
                >
                  <span>{micOn ? "🎙️" : "🔇"}</span>
                  {micOn ? "Mute" : "Unmute"}
                </button>

                <button
                  className={`control-button ${videoOn ? "active" : ""}`}
                  onClick={toggleCamera}
                  disabled={screenSharing}
                >
                  <span>{videoOn ? "📹" : "🚫"}</span>
                  {videoOn ? "Camera Off" : "Camera On"}
                </button>

                <button
                  className={`control-button ${screenSharing ? "active" : ""}`}
                  onClick={toggleScreenShare}
                  disabled={isMobile || !screenShareSupported}
                  title={
                    isMobile
                      ? "Screen sharing isn't available on mobile devices"
                      : !screenShareSupported
                        ? "Screen sharing isn't supported in this browser"
                        : ""
                  }
                >
                  <span>🖥️</span>
                  {screenSharing ? "Stop Share" : "Share Screen"}
                </button>

                <button
                  className="control-button end-call"
                  onClick={handleEndCall}
                >
                  <span>✕</span>
                  End Call
                </button>
              </div>
            )}
          </div>

          {!inCall && (
            <div className="room-panel">
              <div className="room-header">
                <div>
                  <span className="panel-label">YOUR ROOM</span>

                  {roomId ? (
                    <div className="room-id">{roomId}</div>
                  ) : (
                    <div className="room-id empty">No room created</div>
                  )}
                </div>

                {roomId && (
                  <button className="copy-button" onClick={copyRoomId}>
                    Copy ID
                  </button>
                )}
              </div>

              <button
                className="create-room-button"
                onClick={handleCreateRoom}
                disabled={loading}
              >
                <span>＋</span>
                {loading ? "Creating Room..." : "Create New Room"}
              </button>

              <div className="divider">
                <span>OR JOIN EXISTING ROOM</span>
              </div>

              <div className="join-form">
                <input
                  type="text"
                  placeholder="Paste Room ID"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                />

                <button onClick={handleJoinExistingRoom} disabled={loading}>
                  {loading ? "Checking..." : "Join"}
                  <span>→</span>
                </button>
              </div>

              {roomId && (
                <button
                  className="join-created-room"
                  onClick={handleJoinRoom}
                  disabled={loading}
                >
                  Join your created room
                </button>
              )}

              {error && <div className="error-message">{error}</div>}
            </div>
          )}
          {inCall && error && (
            <div className="error-message in-call-error">{error}</div>
          )}
        </section>
      </main>

      {showMediaModal && (
        <div className="modal-overlay">
          <div className="media-modal">
            <button
              className="modal-close"
              onClick={() => setShowMediaModal(false)}
            >
              ×
            </button>

            <span className="eyebrow">JOIN ROOM</span>

            <h2>How do you want to join?</h2>

            <p>Choose what you want to share with the other participant.</p>

            <button
              className="media-option"
              onClick={() => handleMediaChoice("camera-mic")}
            >
              <span className="media-icon">📹</span>

              <span>
                <strong>Camera + Microphone</strong>
                <small>Join with video and audio</small>
              </span>
            </button>

            <button
              className="media-option"
              onClick={() => handleMediaChoice("mic-only")}
            >
              <span className="media-icon">🎙️</span>

              <span>
                <strong>Microphone Only</strong>
                <small>Join with audio, no video</small>
              </span>
            </button>

            <button
              className="media-option"
              onClick={() => handleMediaChoice("none")}
            >
              <span className="media-icon">👤</span>

              <span>
                <strong>Camera & Microphone Off</strong>
                <small>Join without sharing media</small>
              </span>
            </button>
          </div>
        </div>
      )}

      <footer>
        <span>Peer-to-peer video communication</span>
        <span>WebRTC • Socket.IO</span>
      </footer>
    </div>
  );
}

export default App;
