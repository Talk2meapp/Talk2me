// ============================================
// TALK2ME - Application d'écoute anonyme
// ============================================

const APP_NAME = 'Talk2Me';
const SERVER_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://talk2me.onrender.com';

let socket = null;
let currentUser = {
    type: null,
    pseudo: null,
    roomId: null
};

// ============================================
// SERVICE WORKER (PWA)
// ============================================
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

// ============================================
// DEMANDE DE PERMISSION DE NOTIFICATION
// ============================================
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('✅ Notifications activées');
            }
        });
    }
}

// ============================================
// NOTIFICATION NAVIGATEUR (POP-UP)
// ============================================
function showBrowserNotification(personName) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('🔔 Talk2Me - Nouvelle demande', {
            body: personName + ' a besoin de parler. Rejoignez la conversation !',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
            tag: 'talk2me-new-request',
            requireInteraction: true,
            vibrate: [200, 100, 200]
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}

// ============================================
// NOTIFICATION SONORE
// ============================================
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Son 1 : Ding
        const oscillator1 = audioCtx.createOscillator();
        const gainNode1 = audioCtx.createGain();
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioCtx.destination);
        oscillator1.frequency.value = 800;
        oscillator1.type = 'sine';
        gainNode1.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator1.start(audioCtx.currentTime);
        oscillator1.stop(audioCtx.currentTime + 0.3);
        
        // Son 2 : Dong
        setTimeout(() => {
            const oscillator2 = audioCtx.createOscillator();
            const gainNode2 = audioCtx.createGain();
            oscillator2.connect(gainNode2);
            gainNode2.connect(audioCtx.destination);
            oscillator2.frequency.value = 600;
            oscillator2.type = 'sine';
            gainNode2.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            oscillator2.start(audioCtx.currentTime);
            oscillator2.stop(audioCtx.currentTime + 0.5);
        }, 300);
    } catch (e) {
        console.log('Son non supporté');
    }
}

// ============================================
// SON LÉGER POUR MESSAGE REÇU
// ============================================
function playMessageSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 500;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        // Silencieux
    }
}

// ============================================
// NOTIFICATION VISUELLE DANS LA PAGE
// ============================================
function showInAppNotification(message) {
    const notif = document.createElement('div');
    notif.className = 'in-app-notification';
    notif.innerHTML = '🔔 ' + message;
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--gradient, linear-gradient(135deg, #6C5CE7, #00B894));
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: 600;
        z-index: 9999;
        animation: slideDown 0.5s ease, fadeOut 0.5s ease 4s forwards;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        cursor: pointer;
    `;
    notif.onclick = () => notif.remove();
    document.body.appendChild(notif);
    
    setTimeout(() => {
        if (notif.parentNode) notif.remove();
    }, 5000);
}

// ============================================
// ANIMATIONS CSS POUR NOTIFICATIONS
// ============================================
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideDown {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(notificationStyles);

// ============================================
// INSTALLATION PWA
// ============================================
window.addEventListener('appinstalled', () => {
    console.log('✅ Talk2Me installée !');
});

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
            console.log('Installation: ' + outcome);
            deferredPrompt = null;
            installBtn.remove();
        }
    };
    
    const heroSection = document.querySelector('.hero');
    if (heroSection) {
        heroSection.appendChild(installBtn);
    }
});

// ============================================
// NAVIGATION
// ============================================
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
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
        socket = io(SERVER_URL, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log('✅ Connecté à ' + APP_NAME);
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
            
            // 🔔 NOTIFICATIONS POUR LE BÉNÉVOLE
            if (currentUser.type === 'volunteer') {
                playNotificationSound();
                showBrowserNotification(data.partnerPseudo);
                showInAppNotification(data.partnerPseudo + ' a besoin de parler !');
            }
        });
        
        socket.on('message', (message) => {
            displayMessage(message, 'received');
            playMessageSound();
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
    
    displaySystemMessage('✅ Connecté avec ' + partnerPseudo + '. Parlez librement et en toute confidentialité.');
    displaySystemMessage('💡 Rappel : cet espace est bienveillant et sans jugement.');
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
    messageElement.className = 'message ' + type;
    
    if (type === 'system') {
        messageElement.innerHTML = '<small>' + message + '</small>';
    } else {
        const sender = message.sender || 'Anonyme';
        const time = message.timestamp 
            ? new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) 
            : '';
        messageElement.innerHTML = `
            <small>${sender} ${time ? '· ' + time : ''}</small>
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

// ============================================
// INSCRIPTION BÉNÉVOLE
// ============================================
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
    
    fetch(SERVER_URL + '/api/register-volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(volunteerData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentUser = volunteerData;
            alert('🎉 Merci ' + pseudo + ' ! Bienvenue sur ' + APP_NAME + '.');
            requestNotificationPermission();
            showSection('chat');
        }
    })
    .catch(() => {
        currentUser = volunteerData;
        alert('✅ Bienvenue sur ' + APP_NAME + ', ' + pseudo + ' !');
        showSection('chat');
    });
    
    return false;
}

// ============================================
// PARTAGE SUR RÉSEAUX SOCIAUX
// ============================================
function shareOnFacebook() {
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href));
}

function shareOnTwitter() {
    const text = "Découvrez Talk2Me, une application gratuite d'écoute anonyme 💚";
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(window.location.href));
}

function shareOnWhatsApp() {
    const text = "Talk2Me - Application d'écoute anonyme et gratuite 💚 " + window.location.href;
    window.open('https://wa.me/?text=' + encodeURIComponent(text));
}

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 ' + APP_NAME + ' est prêt !');
    document.title = APP_NAME + ' - Parlez, nous écoutons';
    showSection('home');
    
    const container = document.querySelector('.container');
    if (container) {
        container.style.opacity = '0';
        setTimeout(() => {
            container.style.transition = 'opacity 0.6s ease';
            container.style.opacity = '1';
        }, 100);
    }
});

window.addEventListener('beforeunload', () => {
    if (socket && socket.connected) {
        socket.disconnect();
    }
});

window.addEventListener('error', (event) => {
    console.error('Erreur:', event.error);
});
