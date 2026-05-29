const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const APP_NAME = 'Talk2Me';
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname + '/..'));
app.use(require('cors')());

// Files d'attente
let waitingUsers = [];
let availableVolunteers = [];
let activeChats = new Map();

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../index.html');
});

app.post('/api/register-volunteer', (req, res) => {
    const { pseudo, email, availability, motivation } = req.body;
    
    if (!pseudo || !email) {
        return res.status(400).json({ error: 'Pseudo et email requis' });
    }
    
    console.log('✅ Nouveau bénévole: ' + pseudo);
    
    res.json({ 
        success: true, 
        message: 'Bienvenue sur ' + APP_NAME + ' !'
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        app: APP_NAME,
        onlineVolunteers: availableVolunteers.length,
        waitingUsers: waitingUsers.length,
        activeChats: activeChats.size
    });
});

// WebSocket
io.on('connection', (socket) => {
    console.log('🔗 Connexion: ' + socket.id);
    io.emit('onlineCount', availableVolunteers.length);
    
    socket.on('joinQueue', (userData) => {
        socket.userData = userData;
        
        if (userData.type === 'volunteer') {
            // Ajouter le bénévole à la liste
            availableVolunteers.push({
                socketId: socket.id,
                pseudo: userData.pseudo,
                status: 'available'
            });
            console.log('👂 Bénévole en ligne: ' + userData.pseudo);
            
            // Chercher un utilisateur en attente
            matchUsers();
        } else {
            // Ajouter l'utilisateur à la file d'attente
            waitingUsers.push({
                socketId: socket.id,
                pseudo: userData.pseudo
            });
            console.log('🙋 Utilisateur en attente: ' + userData.pseudo);
            
            // Informer de la position
            socket.emit('queuePosition', waitingUsers.length);
            
            // Chercher un bénévole
            matchUsers();
        }
        
        io.emit('onlineCount', availableVolunteers.length);
    });
    
    socket.on('sendMessage', (messageData) => {
        const chat = activeChats.get(socket.id);
        
        if (chat) {
            io.to(chat.partnerId).emit('message', {
                text: messageData.text,
                sender: socket.userData?.pseudo || 'Anonyme',
                timestamp: new Date().toISOString()
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Déconnexion: ' + socket.id);
        
        // Nettoyer les files
        waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
        availableVolunteers = availableVolunteers.filter(v => v.socketId !== socket.id);
        
        // Si le socket était dans un chat actif
        if (activeChats.has(socket.id)) {
            const chat = activeChats.get(socket.id);
            io.to(chat.partnerId).emit('partnerDisconnected');
            activeChats.delete(socket.id);
            activeChats.delete(chat.partnerId);
        }
        
        io.emit('onlineCount', availableVolunteers.length);
    });
});

function matchUsers() {
    // Tant qu'il y a des utilisateurs ET des bénévoles disponibles
    while (waitingUsers.length > 0 && availableVolunteers.length > 0) {
        const user = waitingUsers.shift();
        const volunteer = availableVolunteers.shift();
        
        const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Créer le chat
        activeChats.set(user.socketId, {
            partnerId: volunteer.socketId,
            roomId: roomId
        });
        activeChats.set(volunteer.socketId, {
            partnerId: user.socketId,
            roomId: roomId
        });
        
        // Informer les deux
        io.to(user.socketId).emit('matchFound', {
            roomId: roomId,
            partnerPseudo: volunteer.pseudo
        });
        
        io.to(volunteer.socketId).emit('matchFound', {
            roomId: roomId,
            partnerPseudo: user.pseudo
        });
        
        console.log('✅ Match: ' + user.pseudo + ' ↔ ' + volunteer.pseudo);
    }
    
    io.emit('onlineCount', availableVolunteers.length);
}

http.listen(PORT, () => {
    console.log('🚀 ' + APP_NAME + ' en ligne sur le port ' + PORT);
});
