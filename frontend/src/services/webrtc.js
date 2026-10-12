export const createPeerConnection = () => {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  });

  return peerConnection;
};

export const getLocalStream = async ({ video, audio }) => {
  return navigator.mediaDevices.getUserMedia({
    video,
    audio,
  });
};
