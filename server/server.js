const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname + '/..'));
app.use(require('cors')());

let volunteers = [];
let users = [];
let chats = {};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../index.html');
});

app.post('/api/register-volunteer', (req, res) => {
    res.json({ success: true, message: 'OK' });
});

app.get('/api/status', (req, res) => {
    res.json({
        app: 'Talk2Me',
        volunteers: volunteers.length,
        users: users.length,
        chats: Object.keys(chats).length / 2
    });
});

io.on('connection', (socket) => {
    console.log('✅ Connecté: ' + socket.id);
    io.emit('onlineCount', volunteers.length);
    
    socket.on('joinQueue', (data) => {
        socket.data = data;
        
        if (data.type === 'volunteer') {
            volunteers.push(socket);
            console.log('👂 Bénévole: ' + data.pseudo);
        } else {
            users.push(socket);
            console.log('🙋 User: ' + data.pseudo);
        }
        
        tryMatch();
        io.emit('onlineCount', volunteers.length);
    });
    
    socket.on('sendMessage', (msg) => {
        const partner = chats[socket.id];
        if (partner) {
            partner.emit('message', {
                text: msg.text,
                sender: socket.data?.pseudo || 'Anonyme'
            });
        }
    });
    
    socket.on('disconnect', () => {
        volunteers = volunteers.filter(v => v.id !== socket.id);
        users = users.filter(u => u.id !== socket.id);
        
        const partner = chats[socket.id];
        if (partner) {
            partner.emit('partnerDisconnected');
            delete chats[partner.id];
        }
        delete chats[socket.id];
        
        io.emit('onlineCount', volunteers.length);
    });
});

function tryMatch() {
    while (users.length > 0 && volunteers.length > 0) {
        const user = users.shift();
        const volunteer = volunteers.shift();
        
        chats[user.id] = volunteer;
        chats[volunteer.id] = user;
        
        const roomId = 'room_' + Date.now();
        
        user.emit('matchFound', {
            roomId: roomId,
            partnerPseudo: volunteer.data.pseudo
        });
        
        volunteer.emit('matchFound', {
            roomId: roomId,
            partnerPseudo: user.data.pseudo
        });
        
        console.log('✅ Match OK');
    }
}

http.listen(PORT, () => {
    console.log('🚀 Talk2Me sur le port ' + PORT);
});
