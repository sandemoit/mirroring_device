const express = require('express');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const port = 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Serve connect.html for /connect route
app.get('/connect', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'connect.html'));
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket server
const wss = new WebSocket.Server({ port: 8080 });
const connections = new Map();
const connectionPairs = new Map();

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    ws.id = Math.random().toString(36).substr(2, 9);
    console.log('Assigned ID:', ws.id);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('FULL MESSAGE DETAILS:', JSON.stringify(data, null, 2));

            // Debug: Log all current connections
            console.log('Current Connections:', 
                Array.from(connections.keys()),
                'Connection IDs:', 
                Array.from(connections.values()).map(conn => conn.id)
            );

            if (data.type === 'register') {
                // Hapus kode sebelumnya jika sudah ada
                for (const [existingCode, conn] of connections.entries()) {
                    if (conn.id === ws.id) {
                        connections.delete(existingCode);
                    }
                }

                connections.set(data.code, {
                    ws: ws,
                    id: ws.id
                });
                console.log(`Device registered with code: ${data.code}`);
            } 
            else if (data.type === 'offer') {
                // Cari koneksi berdasarkan kode yang tepat
                const targetConnection = Array.from(connections.entries())
                    .find(([code]) => code === data.target);

                console.log('Offer Target Lookup:', {
                    targetCode: data.target,
                    targetFound: !!targetConnection
                });

                if (!targetConnection) {
                    console.error(`Target ${data.target} not found in connections`);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Target ${data.target} not found`
                    }));
                    return;
                }

                const [targetCode, targetConn] = targetConnection;

                if (targetConn && targetConn.ws.readyState === WebSocket.OPEN) {
                    connectionPairs.set(ws.id, targetCode);
                    connectionPairs.set(targetConn.id, ws.id);
                    
                    data.source = ws.id;
                    try {
                        targetConn.ws.send(JSON.stringify(data));
                        console.log(`Successfully forwarded offer from ${ws.id} to ${targetCode}`);
                    } catch (sendError) {
                        console.error('Error forwarding offer:', sendError);
                    }
                } else {
                    console.error(`Target ${data.target} not available`);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Target connection unavailable'
                    }));
                }
            }
            else if (data.type === 'answer') {
                const sourceId = connectionPairs.get(ws.id);
                const sourceConnection = Array.from(connections.entries())
                    .find(([code, conn]) => conn.id === sourceId);

                if (sourceConnection) {
                    const [sourceCode, sourceConn] = sourceConnection;
                    if (sourceConn.ws.readyState === WebSocket.OPEN) {
                        data.source = ws.id;
                        sourceConn.ws.send(JSON.stringify(data));
                        console.log(`Forwarding answer from ${ws.id} to ${sourceId}`);
                    }
                }
            }
            else if (data.type === 'candidate') {
                const targetConnection = Array.from(connections.entries())
                    .find(([code]) => code === data.target);

                if (targetConnection) {
                    const [targetCode, targetConn] = targetConnection;
                    if (targetConn.ws.readyState === WebSocket.OPEN) {
                        data.source = ws.id;
                        targetConn.ws.send(JSON.stringify(data));
                        console.log(`Forwarding candidate from ${ws.id} to ${targetCode}`);
                    }
                }
            }
        } catch (error) {
            console.error('Parsing Error:', error);
        }
    });

    ws.on('close', () => {
        // Remove all connections for this websocket
        for (const [code, conn] of connections.entries()) {
            if (conn.ws === ws) {
                connections.delete(code);
                console.log(`Connection for code ${code} closed`);
                
                // Clear paired connections
                const pairedId = connectionPairs.get(ws.id);
                if (pairedId) {
                    connectionPairs.delete(ws.id);
                    connectionPairs.delete(pairedId);
                }
                break;
            }
        }
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});