// ============================================
// TALK2ME - Application d'écoute anonyme
// ============================================

const APP_NAME = 'Talk2Me';
const SERVER_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://talk2me.app';

let socket = null;
let currentUser = {
    type: null,
    pseudo: null,
    roomId: null
};

// Service Worker pour PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Talk2Me SW enregistré');
            })
            .catch(err => {
                console.log('❌ SW échec:', err);
            });
    });
}

// Notification d'installation PWA
window.addEventListener('appinstalled', () => {
    console.log('✅ Talk2Me installée !');
});

// Bouton d'installation
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    const installBtn = document.createElement('button');
    installBtn.textContent = '📱 Installer Talk2Me';
    installBtn.className = 'install-btn';
    installBtn.onclick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Installation: ${outcome}`);
            deferredPrompt = null;
            installBtn.remove();
        }
    };
    document.querySelector('.hero')?.appendChild(installBtn);
});

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        if (sectionId === 'chat') {
            initializeChat();
        }
    }
}

// Chat
function initializeChat() {
    if (!currentUser.pseudo) {
        currentUser.pseudo = 'Anonyme' + Math.floor(Math.random() * 1000);
        currentUser.type = 'user';
    }
    
    if (!socket) {
        socket = io(SERVER_URL, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log(`✅ Connecté à ${APP_NAME}`);
            socket.emit('joinQueue', currentUser);
        });
        
        socket.on('queuePosition', (position) => {
            const queueEl = document.getElementById('queuePosition');
            if (queueEl) {
                queueEl.textContent = position === 0 ? 'Vous êtes le prochain !' : position;
            }
        });
        
        socket.on('matchFound', (data) => {
            currentUser.roomId = data.roomId;
            startChat(data.partnerPseudo);
        });
        
        socket.on('message', (message) => {
            displayMessage(message, 'received');
        });
        
        socket.on('partnerDisconnected', () => {
            displaySystemMessage('Votre interlocuteur s\'est déconnecté. Recherche d\'un nouveau bénévole...');
            resetChat();
            socket.emit('joinQueue', currentUser);
        });
        
        socket.on('onlineCount', (count) => {
            const countEl = document.getElementById('onlineCount');
            if (countEl) countEl.textContent = count;
        });
        
        socket.on('connect_error', () => {
            displaySystemMessage('⚠️ Reconnexion en cours...');
        });
    } else if (socket.disconnected) {
        socket.connect();
        socket.emit('joinQueue', currentUser);
    }
}

function startChat(partnerPseudo) {
    document.getElementById('waitingScreen').style.display = 'none';
    document.getElementById('chatBox').style.display = 'flex';
    document.getElementById('messages').innerHTML = '';
    
    displaySystemMessage(`✅ Connecté avec ${partnerPseudo}. Parlez librement et en toute confidentialité.`);
}

function resetChat() {
    document.getElementById('chatBox').style.display = 'none';
    document.getElementById('waitingScreen').style.display = 'block';
    document.getElementById('messages').innerHTML = '';
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message && socket && currentUser.roomId) {
        socket.emit('sendMessage', {
            text: message,
            roomId: currentUser.roomId,
            sender: currentUser.pseudo,
            timestamp: new Date().toISOString()
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
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    if (type === 'system') {
        messageElement.innerHTML = `<small>${message}</small>`;
    } else {
        messageElement.innerHTML = `
            <small>${message.sender || 'Anonyme'}</small>
            <p>${escapeHtml(message.text || message)}</p>
        `;
    }
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displaySystemMessage(text) {
    displayMessage(text, 'system');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Inscription bénévole
function registerVolunteer(event) {
    event.preventDefault();
    
    const pseudo = document.getElementById('pseudo').value.trim();
    const email = document.getElementById('email').value.trim();
    const availability = document.getElementById('availability').value;
    const motivation = document.getElementById('motivation').value.trim();
    
    if (!pseudo || !email) {
        alert('Veuillez remplir tous les champs obligatoires.');
        return false;
    }
    
    const volunteerData = { pseudo, email, availability, motivation, type: 'volunteer' };
    
    fetch(`${SERVER_URL}/api/register-volunteer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(volunteerData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentUser = volunteerData;
            alert(`🎉 Merci ${pseudo} ! Bienvenue sur ${APP_NAME}.`);
            showSection('chat');
        }
    })
    .catch(() => {
        currentUser = volunteerData;
        alert(`✅ Bienvenue sur ${APP_NAME}, ${pseudo} !`);
        showSection('chat');
    });
    
    return false;
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log(`🚀 ${APP_NAME} est prêt !`);
    document.title = `${APP_NAME} - Parlez, nous écoutons`;
    showSection('home');
    
    const container = document.querySelector('.container');
    container.style.opacity = '0';
    setTimeout(() => {
        container.style.transition = 'opacity 0.6s ease';
        container.style.opacity = '1';
    }, 100);
});

window.addEventListener('beforeunload', () => {
    if (socket?.connected) socket.disconnect();
});
