// ============================================
// TALK2ME v2 - Écoute Anonyme
// Comme Be My Eyes pour la santé mentale
// ============================================

const APP_NAME = 'Talk2Me';
const SERVER_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://talk2me.onrender.com';

// Numéros d'urgence Côte d'Ivoire
const EMERGENCY_NUMBERS = [
    { name: 'Police Secours', number: '170' },
    { name: 'Pompiers', number: '180' },
    { name: 'SAMU', number: '144' },
    { name: 'Protection Enfance', number: '116' },
    { name: 'Numéro Unique', number: '143' }
];

let socket = null;
let currentUser = {
    type: null,
    pseudo: null,
    roomId: null
};
let incomingCallData = null;
let callTimerInterval = null;
let callSeconds = 0;

// ============================================
// DEMANDE DE PERMISSION NOTIFICATIONS
// ============================================
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ============================================
// SONNERIE D'APPEL ENTRANT
// ============================================
function playRingtone() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function beep(freq, duration, delay) {
            setTimeout(() => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + duration);
            }, delay);
        }
        
        // Sonnerie style téléphone
        for (let i = 0; i < 6; i++) {
            beep(800, 0.2, i * 400);
            beep(1000, 0.2, i * 400 + 200);
        }
    } catch (e) {}
}

// ============================================
// VIBRATION
// ============================================
function vibrate(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// ============================================
// NOTIFICATION NAVIGATEUR
// ============================================
function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
            tag: 'talk2me-call',
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200]
        });
    }
}

// ============================================
// APPEL ENTRANT (POUR LE BÉNÉVOLE)
// ============================================
function showIncomingCall(partnerPseudo) {
    incomingCallData = partnerPseudo;
    
    document.getElementById('incomingCall').style.display = 'flex';
    document.getElementById('callerName').textContent = partnerPseudo;
    
    // Sonnerie + vibration
    playRingtone();
    vibrate([500, 200, 500, 200, 500]);
    showBrowserNotification('📞 Demande d\'écoute', partnerPseudo + ' a besoin de parler');
    
    // Timer
    callSeconds = 0;
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        const secs = (callSeconds % 60).toString().padStart(2, '0');
        document.getElementById('callTimer').textContent = mins + ':' + secs;
    }, 1000);
}

function acceptCall() {
    clearInterval(callTimerInterval);
    document.getElementById('incomingCall').style.display = 'none';
    document.getElementById('waitingScreen').style.display = 'none';
    document.getElementById('chatBox').style.display = 'flex';
    
    if (currentUser.type === 'volunteer') {
        document.getElementById('btnEmergency').style.display = 'block';
    }
}

function rejectCall() {
    clearInterval(callTimerInterval);
    document.getElementById('incomingCall').style.display = 'none';
    incomingCallData = null;
    socket.emit('joinQueue', currentUser);
}

// ============================================
// ALERTE D'URGENCE
// ============================================
function triggerEmergency() {
    const partnerName = document.getElementById('chatPartnerName').textContent;
    
    if (confirm('⚠️ Êtes-vous sûr de vouloir déclencher une alerte d\'urgence ? Les autorités seront contactées.')) {
        document.getElementById('emergencyAlert').style.display = 'flex';
        
        // Afficher les numéros d'urgence
        const numbersDiv = document.getElementById('emergencyNumbers');
        numbersDiv.innerHTML = '<h3>Numéros à contacter :</h3>';
        EMERGENCY_NUMBERS.forEach(num => {
            numbersDiv.innerHTML += `
                <a href="tel:${num.number}" class="emergency-call-btn">
                    📞 ${num.name} : <strong>${num.number}</strong>
                </a>
            `;
        });
        
        // Envoyer l'alerte au serveur
        if (socket) {
            socket.emit('emergencyAlert', {
                roomId: currentUser.roomId,
                volunteerName: currentUser.pseudo,
                userInDanger: partnerName
            });
        }
        
        // Notification + vibration intense
        showBrowserNotification('🚨 ALERTE URGENCE', 'Un utilisateur est en danger !');
        vibrate([1000, 200, 1000, 200, 1000]);
    }
}

function closeEmergency() {
    document.getElementById('emergencyAlert').style.display = 'none';
}

// ============================================
// ALERTE D'URGENCE (bouton dans le chat)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Créer le bouton d'urgence flottant
    const emergencyFloatBtn = document.createElement('button');
    emergencyFloatBtn.id = 'emergencyFloatBtn';
    emergencyFloatBtn.className = 'emergency-float-btn';
    emergencyFloatBtn.innerHTML = '🚨';
    emergencyFloatBtn.title = 'Alerte d\'urgence';
    emergencyFloatBtn.onclick = triggerEmergency;
    document.body.appendChild(emergencyFloatBtn);
});

// ============================================
// NAVIGATION
// ============================================
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        section.scrollIntoView({ behavior: 'smooth' });
        if (sectionId === 'chat') {
            requestNotificationPermission();
            initializeChat();
        }
    }
}

// ============================================
// GESTION DU CHAT
// ============================================
function initializeChat() {
    if (!currentUser.pseudo) {
        currentUser.pseudo = 'Anonyme' + Math.floor(Math.random() * 1000);
        currentUser.type = 'user';
    }
    
    if (!socket) {
        socket = io(SERVER_URL);
        
        socket.on('connect', () => {
            socket.emit('joinQueue', currentUser);
        });
        
        socket.on('matchFound', (data) => {
            currentUser.roomId = data.roomId;
            
            if (currentUser.type === 'volunteer') {
                showIncomingCall(data.partnerPseudo);
            } else {
                document.getElementById('waitingScreen').style.display = 'none';
                document.getElementById('chatBox').style.display = 'flex';
                document.getElementById('chatPartnerName').textContent = data.partnerPseudo;
            }
        });
        
        socket.on('message', (message) => {
            displayMessage(message, 'received');
        });
        
        socket.on('partnerDisconnected', () => {
            displaySystemMessage('Déconnecté. Recherche...');
            document.getElementById('chatBox').style.display = 'none';
            document.getElementById('waitingScreen').style.display = 'block';
            socket.emit('joinQueue', currentUser);
        });
        
        socket.on('onlineCount', (count) => {
            document.getElementById('onlineCount').textContent = count;
        });
        
        socket.on('emergencyAlertReceived', (data) => {
            alert('🚨 ALERTE : ' + data.volunteerName + ' signale une urgence !');
        });
    } else if (socket.disconnected) {
        socket.connect();
        socket.emit('joinQueue', currentUser);
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message && socket && currentUser.roomId) {
        socket.emit('sendMessage', {
            text: message,
            roomId: currentUser.roomId,
            sender: currentUser.pseudo
        });
        displayMessage({ text: message, sender: 'Vous' }, 'sent');
        input.value = '';
        input.focus();
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function displayMessage(message, type) {
    const div = document.getElementById('messages');
    if (!div) return;
    
    const el = document.createElement('div');
    el.className = 'message ' + type;
    
    if (type === 'system') {
        el.innerHTML = '<small>' + message + '</small>';
    } else {
        el.innerHTML = '<small>' + (message.sender || 'Anonyme') + '</small><p>' + (message.text || message) + '</p>';
    }
    
    div.appendChild(el);
    div.scrollTop = div.scrollHeight;
}

function displaySystemMessage(text) {
    displayMessage(text, 'system');
}

function cancelSearch() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    showSection('home');
}

// ============================================
// INSCRIPTION BÉNÉVOLE
// ============================================
function registerVolunteer(event) {
    event.preventDefault();
    
    const pseudo = document.getElementById('pseudo').value.trim();
    const email = document.getElementById('email').value.trim();
    
    if (!pseudo || !email) {
        alert('Veuillez remplir tous les champs obligatoires.');
        return false;
    }
    
    currentUser = {
        pseudo: pseudo,
        email: email,
        type: 'volunteer'
    };
    
    alert('🎉 Bienvenue ' + pseudo + ' ! Vous êtes maintenant bénévole.');
    requestNotificationPermission();
    showSection('chat');
    
    return false;
}

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    showSection('home');
    document.title = APP_NAME + ' - Écoute Anonyme';
});

window.addEventListener('beforeunload', () => {
    if (socket?.connected) socket.disconnect();
});
