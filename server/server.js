const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:5500", "https://talk2me.onrender.com"],
        methods: ["GET", "POST"]
    }
});

const APP_NAME = 'Talk2Me';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname + '/..'));
app.use(require('cors')());

// Stockage en mémoire
const waitingQueue = [];
const activeChats = new Map();
const volunteers = new Set();

// Route principale
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../index.html');
});

// Route d'inscription bénévole
app.post('/api/register-volunteer', (req, res) => {
    const { pseudo, email, availability, motivation } = req.body;
    
    if (!pseudo || !email) {
        return res.status(400).json({ error: 'Pseudo et email requis' });
    }
    
    const volunteerId = Date.now().toString();
    volunteers.add({
        id: volunteerId,
        pseudo,
        email,
        availability,
        motivation,
        status: 'available',
        joinedAt: new Date()
    });
    
    console.log(`✅ Nouveau bénévole Talk2Me : ${pseudo}`);
    
    res.json({ 
        success: true, 
        message: `Bienvenue sur ${APP_NAME} !`,
        volunteerId
    });
});

// Route statut
app.get('/api/status', (req, res) => {
    res.json({
        app: APP_NAME,
        domain: 'talk2me.app',
        onlineVolunteers: volunteers.size,
        waitingUsers: waitingQueue.length,
        activeChats: activeChats.size,
        uptime: process.uptime()
    });
});

// WebSocket
io.on('connection', (socket) => {
    console.log(`🔗 Talk2Me - Nouvelle connexion : ${socket.id}`);
    io.emit('onlineCount', volunteers.size);
    
    socket.on('joinQueue', (userData) => {
        socket.userData = userData;
        
        if (userData.type === 'volunteer') {
            volunteers.add({ ...userData, socketId: socket.id });
            matchUsers(socket);
        } else {
            waitingQueue.push({ ...userData, socketId: socket.id });
            socket.emit('queuePosition', waitingQueue.length);
            matchUsers(socket);
        }
        
        io.emit('onlineCount', volunteers.size);
    });
    
    socket.on('sendMessage', (messageData) => {
        const chat = activeChats.get(socket.id) || 
                    Array.from(activeChats.entries())
                         .find(([key, value]) => value.partnerId === socket.id);
        
        if (chat) {
            const partnerId = chat[1].partnerId;
            io.to(partnerId).emit('message', {
                text: messageData.text,
                sender: socket.userData?.pseudo || 'Anonyme',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`❌ Déconnexion : ${socket.id}`);
        
        const queueIndex = waitingQueue.findIndex(u => u.socketId === socket.id);
        if (queueIndex !== -1) waitingQueue.splice(queueIndex, 1);
        
        volunteers.forEach(v => {
            if (v.socketId === socket.id) volunteers.delete(v);
        });
        
        if (activeChats.has(socket.id)) {
            const chat = activeChats.get(socket.id);
            io.to(chat.partnerId).emit('partnerDisconnected');
            activeChats.delete(socket.id);
        }
        
        io.emit('onlineCount', volunteers.size);
    });
});

// Matching des utilisateurs
function matchUsers(socket) {
    if (socket.userData?.type === 'volunteer' && waitingQueue.length > 0) {
        const user = waitingQueue.shift();
        const roomId = `room_${Date.now()}`;
        
        activeChats.set(socket.id, { partnerId: user.socketId, roomId });
        activeChats.set(user.socketId, { partnerId: socket.id, roomId });
        
        socket.emit('matchFound', { roomId, partnerPseudo: user.pseudo });
        io.to(user.socketId).emit('matchFound', { roomId, partnerPseudo: socket.userData.pseudo });
        
        volunteers.forEach(v => {
            if (v.socketId === socket.id) v.status = 'busy';
        });
    } else if (socket.userData?.type !== 'volunteer') {
        let volunteerFound = false;
        volunteers.forEach(v => {
            if (v.status === 'available' && !volunteerFound && v.socketId !== socket.id) {
                const roomId = `room_${Date.now()}`;
                
                activeChats.set(v.socketId, { partnerId: socket.id, roomId });
                activeChats.set(socket.id, { partnerId: v.socketId, roomId });
                
                io.to(v.socketId).emit('matchFound', { roomId, partnerPseudo: socket.userData.pseudo });
                socket.emit('matchFound', { roomId, partnerPseudo: v.pseudo });
                
                v.status = 'busy';
                volunteerFound = true;
                
                const index = waitingQueue.findIndex(u => u.socketId === socket.id);
                if (index !== -1) waitingQueue.splice(index, 1);
            }
        });
    }
}

// Démarrage du serveur
http.listen(PORT, () => {
    console.log(`🚀 ${APP_NAME} est en ligne sur le port ${PORT}`);
    console.log(`🌐 URL locale : http://localhost:${PORT}`);
    console.log(`📊 Statut : http://localhost:${PORT}/api/status`);
});
