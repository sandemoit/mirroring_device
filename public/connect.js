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
        const data = JSON.parse(message.data);
        if (data.type === 'candidate') {
            console.log('Received ICE Candidate:', data.candidate.candidate);
            if (peerConnection && data.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('Added ICE Candidate:', data.candidate.candidate);
            }
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

        if (!signalingServer || signalingServer.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        const config = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };

        peerConnection = new RTCPeerConnection(config);

        // Handle ICE candidate
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signalingServer.send(JSON.stringify({
                    type: 'candidate',
                    target: code, // Kirim kandidat ke kode perangkat
                    candidate: event.candidate
                }));
                console.log('Sending ICE Candidate to:', code);
            }
        };

        // Handle remote track
        peerConnection.ontrack = (event) => {
            console.log('Remote track received:', event.track.kind);
            const video = document.getElementById('remote-video');
            if (video.srcObject !== event.streams[0]) {
                video.srcObject = event.streams[0];
                video.play().catch(error => {
                    console.error('Error playing video:', error);
                });
                console.log('Remote stream set to video element');
            } else {
                console.log('Stream already set');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') {
                console.log('ICE Connection Established');
            }
        };


        const offer = await peerConnection.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: false
        });
        await peerConnection.setLocalDescription(offer);

        // Send offer
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

    if (peerConnection) {
        peerConnection.close();
    }

    startConnection(code);
});

// Initialize WebSocket
initWebSocket();