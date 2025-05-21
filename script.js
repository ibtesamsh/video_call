// const socket = io();
// const localVideo = document.getElementById('localVideo');
// const remoteVideo = document.getElementById('remoteVideo');
// const startCallBtn = document.getElementById('startCall');
// const startContainer = document.getElementById('startContainer');
// const videosContainer = document.getElementById('videos');

// let peerConnection;
// let roomId;

// // Handle Start Call (Agent)
// startCallBtn.onclick = async () => {
//   const res = await fetch('/generate-room');
//   const { roomId: newRoomId } = await res.json();

//   const LAN_IP = '192.168.0.141:3000';
//   const joinURL = `http://${LAN_IP}?room=${newRoomId}`;

//   alert(`Send this link to the customer:\n\n${joinURL}`);
//   window.location.href = joinURL; // Agent joins own room
// };



// async function init(roomId) {
//   startContainer.style.display = 'none';
//   videosContainer.style.display = 'flex';

//   // Step 1: Get local stream FIRST
//   const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//   localVideo.srcObject = localStream;

//   // Step 2: Create peer connection AFTER media is ready
//   peerConnection = createPeerConnection();

//   // Step 3: Add tracks
//   localStream.getTracks().forEach(track => {
//     peerConnection.addTrack(track, localStream);
//   });

//   // Step 4: Join room
//   socket.emit('join-room', roomId);

//   // Step 5: Handle peer events
//   socket.on('user-connected', async () => {
//     const offer = await peerConnection.createOffer();
//     await peerConnection.setLocalDescription(offer);
//     socket.emit('offer', offer);
//   });

//   socket.on('offer', async offer => {
//     await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
//     const answer = await peerConnection.createAnswer();
//     await peerConnection.setLocalDescription(answer);
//     socket.emit('answer', answer);
//   });

//   socket.on('answer', answer => {
//     peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
//   });

//   socket.on('ice-candidate', candidate => {
//     if (candidate) {
//       peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
//     }
//   });

//   socket.on('user-disconnected', () => {
//     reconnect(localStream);
//   });
// }




// function createPeerConnection() {
//   const pc = new RTCPeerConnection({
//     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
//   });

//   const remoteStream = new MediaStream();
//   remoteVideo.srcObject = remoteStream;

//   pc.ontrack = event => {
//     event.streams[0].getTracks().forEach(track => {
//       remoteStream.addTrack(track);
//     });
//   };

//   pc.onicecandidate = event => {
//     if (event.candidate) {
//       socket.emit('ice-candidate', event.candidate);
//     }
//   };

//   return pc;
// }



// async function reconnect(localStream) {
//   console.log('Reconnecting...');
//   peerConnection.close();
//   peerConnection = createPeerConnection();

//   localStream.getTracks().forEach(track => {
//     peerConnection.addTrack(track, localStream);
//   });

//   const offer = await peerConnection.createOffer();
//   await peerConnection.setLocalDescription(offer);
//   socket.emit('offer', offer);
// }


// // Auto-init if room ID in URL (Customer or Agent joining)
// const queryParams = new URLSearchParams(window.location.search);
// roomId = queryParams.get('room');
// if (roomId) {
//   init(roomId);
// }


const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallBtn = document.getElementById('startCall');
const startContainer = document.getElementById('startContainer');
const videosContainer = document.getElementById('videos');
const endCallBtn = document.getElementById('endCall');
const roleHeading = document.getElementById('roleHeading');
const toggleCameraBtn = document.getElementById('toggleCamera');
const shareScreenBtn = document.getElementById('shareScreen');

let peerConnection;
let localStream;
let roomId;
let isCameraOn = true;
let isSharingScreen = false;
let originalVideoTrack;

const LAN_IP = '192.168.0.141:3000'; // Update if needed

// Determine role from URL param ?role=agent or ?role=customer
const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'agent'; // default to customer if not specified

// Setup UI theme based on role
if (role === 'agent') {
  document.body.classList.add('agent-ui');
  roleHeading.textContent = 'Agent - Video Call';
} else {
  document.body.classList.add('customer-ui');
  document.getElementById('startCall').style.display = 'none';
  roleHeading.textContent = 'Customer - Video Call';

}

// Agent clicks Start Call to generate room and get link
startCallBtn.onclick = async () => {
  const res = await fetch('/generate-room');
  const data = await res.json();
  roomId = data.roomId;

  // Build join URL for customer, including role=customer param
  const joinURL = `http://${LAN_IP}/?room=${roomId}&role=customer`;

    document.getElementById('joinURL').value = joinURL;
  document.getElementById('popup').style.display = 'block';

  // Delay then redirect to agent page
  setTimeout(() => {
    window.location.href = `http://${LAN_IP}/?room=${roomId}&role=agent`;
  }, 4000);

//   alert(`Send this link to the customer:\n\n${joinURL}`);

  // Agent joins own room with role=agent param
//   window.location.href = `http://${LAN_IP}/?room=${roomId}&role=agent`;
};

function copyLink() {
  const input = document.getElementById('joinURL');
  input.select();
  document.execCommand('copy');
  alert('Link copied to clipboard!');
}

toggleCameraBtn.onclick = () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isCameraOn = !isCameraOn;
    videoTrack.enabled = isCameraOn;
    toggleCameraBtn.textContent = isCameraOn ? 'Turn Off Camera' : 'Turn On Camera';
  }
};

endCallBtn.onclick = () => {
  socket.emit('end-call');
  cleanup();
};

// Auto-init if URL has room param (both agent and customer)
roomId = params.get('room');
if (roomId) {
  init(roomId);
}

async function init(room) {
  startContainer.style.display = 'none';
  videosContainer.style.display = 'flex';
  endCallBtn.style.display = 'block';

  // Get local video ONLY - NO AUDIO
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (err) {
    alert('Could not access camera: ' + err.message);
    return;
  }

  localVideo.srcObject = localStream;

  peerConnection = createPeerConnection();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  socket.emit('join-room', room);

  // Handle signaling events
  socket.on('user-connected', async () => {
    if (role === 'agent') {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', offer);
    }
  });

  socket.on('offer', async offer => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
  });

  socket.on('answer', answer => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('ice-candidate', candidate => {
    if (candidate) {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  });

  socket.on('user-disconnected', () => {
    alert('User disconnected.');
    cleanup();
  });

  socket.on('force-disconnect', () => {
    alert('Call ended by the other user.');
    cleanup();
  });

  socket.on('room-expired', () => {
    alert('This room has expired. Cannot join.');
    cleanup();
  });
}

function createPeerConnection() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice-candidate', event.candidate);
    }
  };

  return pc;
}

shareScreenBtn.onclick = async () => {
  if (!peerConnection || !localStream) return;

  if (!isSharingScreen) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace current video track with screen track
      const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
      if (sender) {
        originalVideoTrack = localStream.getVideoTracks()[0];
        sender.replaceTrack(screenTrack);
        localVideo.srcObject = screenStream;

        screenTrack.onended = () => {
          // Revert to original camera stream when screen sharing ends
          sender.replaceTrack(originalVideoTrack);
          localVideo.srcObject = localStream;
          shareScreenBtn.textContent = 'Start Screen Share';
          isSharingScreen = false;
        };

        isSharingScreen = true;
        shareScreenBtn.textContent = 'Stop Screen Share';
      }
    } catch (err) {
      alert('Screen sharing failed: ' + err.message);
    }
  } else {
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (sender && originalVideoTrack) {
      sender.replaceTrack(originalVideoTrack);
      localVideo.srcObject = localStream;
    }
    shareScreenBtn.textContent = 'Start Screen Share';
    isSharingScreen = false;
  }
};


function cleanup() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  socket.disconnect();

  // Reset UI
  startContainer.style.display = 'block';
  videosContainer.style.display = 'none';
  endCallBtn.style.display = 'none';

  // Optionally, redirect or reload page to clear state
  // window.location.href = '/';
}


