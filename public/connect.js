let peerConnection;
let signalingServer;

function initWebSocket() {
    signalingServer = new WebSocket('ws://localhost:8080');
    
    signalingServer.onopen = () => {
        updateStatus('Connected to server', 'success');
        
        // Periksa parameter URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            document.getElementById('connect-code').value = code;
        }
    };

    signalingServer.onmessage = async (message) => {
        try {
            const data = JSON.parse(message.data);
            console.log('Received Signaling Message:', data);
            await handleSignalingMessage(data);
        } catch (error) {
            console.error('Error handling message:', error);
        }
    };
}

function updateStatus(message, type = '') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    statusElement.className = 'status ' + type;
}

async function handleSignalingMessage(data) {
    try {
        if (data.type === 'answer') {
            console.log('Received Answer', data);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === 'candidate') {
            console.log('Received Candidate', data);
            if (peerConnection && data.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } else if (data.type === 'error') {
            console.error('Signaling Error:', data.message);
            updateStatus(data.message, 'error');
        }
    } catch (error) {
        console.error('Error handling signaling message:', error);
    }
}

async function startConnection(code) {
    try {
        console.log('Starting connection with code:', code);

        // Konfirmasi koneksi WebSocket
        if (!signalingServer || signalingServer.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        // Konfigurasi WebRTC
        const config = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: "turn:36.65.33.127:3478",
                    username: "user",
                    credential: "password"
                }
            ]
        };
        
        peerConnection = new RTCPeerConnection(config);

        // Handler untuk ICE candidate
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    target: code,
                    candidate: event.candidate
                }));
            }
        };

        // Handler untuk track
        peerConnection.ontrack = (event) => {
            console.log('Remote track received:', event.track.kind);
            const remoteVideo = document.getElementById('remote-video');
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(error => {
                console.error('Error playing video:', error);
            });
            updateStatus('Connected and receiving video', 'success');
        };

        // Buat offer
        const offer = await peerConnection.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: false
        });
        
        await peerConnection.setLocalDescription(offer);

        // Kirim offer
        signalingServer.send(JSON.stringify({
            type: 'offer',
            target: code,
            offer: offer
        }));

        console.log('Offer sent to:', code);
    } catch (error) {
        console.error('Connection Error:', error);
        updateStatus('Connection error: ' + error.message, 'error');
    }
}

document.getElementById('connect').addEventListener('click', async () => {
    const code = document.getElementById('connect-code').value.trim().toUpperCase();
    if (!code) {
        updateStatus('Please enter a sharing code', 'error');
        return;
    }

    // Close existing connection if any
    if (peerConnection) {
        peerConnection.close();
    }

    // Start new connection
    startConnection(code);
});

// Handle page visibility changes
document.getElementById('connect').addEventListener('click', async () => {
    const code = document.getElementById('connect-code').value.trim().toUpperCase();
    if (!code) {
        updateStatus('Please enter a sharing code', 'error');
        return;
    }

    // Tutup koneksi yang ada jika ada
    if (peerConnection) {
        peerConnection.close();
    }

    // Mulai koneksi baru
    startConnection(code);
});

// Inisialisasi WebSocket
initWebSocket();