let localStream;
let peerConnection;
let signalingServer;
let currentCode = '';
let offerSource = null;

// Fungsi untuk inisialisasi WebSocket
function initWebSocket() {
    signalingServer = new WebSocket('ws://localhost:8080');
    
    signalingServer.onopen = () => {
        updateStatus('Connected to server', 'success');
        if (currentCode) {
            registerCode(currentCode);
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

// Fungsi untuk mengupdate status
function updateStatus(message, type = '') {
    console.log('Status Update:', message, type);
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status ' + type;
    } else {
        console.error('Status element not found');
    }
}

// Fungsi untuk generate code
function generateCode() {
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    console.log('Generated Code:', code);
    return code;
}

// Fungsi untuk register code
function registerCode(code) {
    console.log('Registering code:', code);
    if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(JSON.stringify({
            type: 'register',
            code: code
        }));
        updateStatus('Code successfully registered', 'success');
    } else {
        console.error('WebSocket not ready');
        updateStatus('Server connection not ready', 'error');
    }
}

// Event handler untuk signaling messages
async function handleSignalingMessage(data) {
    if (data.type === 'offer') {
        console.log('Received Offer', data);
        await handleOffer(data);
    } else if (data.type === 'candidate') {
        await handleCandidate(data);
    }
}

// Handle WebRTC offer
async function handleOffer(data) {
    console.log('Received Offer:', data);

    offerSource = data.source;

    const config = { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };

    peerConnection = new RTCPeerConnection(config);

    // Tambahkan track dari localStream ke PeerConnection
    if (localStream) {
        console.log('Adding local stream to PeerConnection');
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    } else {
        console.error('No local stream available');
        return;
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            signalingServer.send(JSON.stringify({
                type: 'candidate',
                target: offerSource, // Kirim kandidat ke pengirim *offer*
                candidate: event.candidate
            }));
            console.log('Sending ICE Candidate to:', offerSource);
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected') {
            console.log('ICE Connection Established');
        }
    };

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log('Remote description set with offer');

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        signalingServer.send(JSON.stringify({
            type: 'answer',
            target: data.source, // Kirim *answer* ke pengirim *offer*
            answer: peerConnection.localDescription
        }));
        console.log('Answer sent to:', data.source);
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle ICE candidate
async function handleCandidate(data) {
    try {
        if (peerConnection && data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generate-code');
    const startButton = document.getElementById('start-sharing');
    
    generateButton.addEventListener('click', () => {
        currentCode = generateCode();
        document.getElementById('generated-code').textContent = currentCode;
        document.getElementById('connect-link').textContent = 
            `${window.location.origin}/connect?code=${currentCode}`;
        startButton.disabled = false;
        registerCode(currentCode);
    });
    
    startButton.addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true, 
                audio: false 
            });
            
            updateStatus('Screen sharing started', 'success');
            
            localStream.getVideoTracks()[0].onended = () => {
                updateStatus('Screen sharing stopped', 'error');
                if (peerConnection) {
                    peerConnection.close();
                }
            };
        } catch (error) {
            console.error('Screen share error:', error);
            updateStatus('Failed to start screen sharing', 'error');
        }
    });
});

initWebSocket();