const mineflayer = require('mineflayer');

// --- CONFIGURATION DE VOTRE SERVEUR ATERNOS ---
const CONFIG = {
  host: 'Emeraldteam.aternos.me', // L'adresse IP / Nom de domaine Aternos
  port: 56996,                      // Le port à 5 chiffres fourni par Aternos
  username: 'Bot_AntiAFK',          // Le pseudo du bot
  version: false                    // 'false' détection automatique de la version
};

function createBotInstance() {
  console.log(`Tentative de connexion à ${CONFIG.host}:${CONFIG.port}...`);

  const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version
  });

  // Dès que le bot apparaît dans le monde
  bot.on('spawn', () => {
    console.log(`[+] ${CONFIG.username} s'est connecté au serveur avec succès !`);
    startAntiAfk(bot);
  });

  // Quand le bot reçoit un message du chat
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`<${username}> ${message}`);
  });

  // Gestion des erreurs et déconnexions
  bot.on('end', (reason) => {
    console.log(`[-] Déconnecté du serveur. Raison : ${reason}`);
    console.log('Nouvelle tentative dans 15 secondes...');
    setTimeout(createBotInstance, 15000); // Reconnexion automatique
  });

  bot.on('error', (err) => {
    console.error('Erreur du bot :', err.message);
  });
}

// --- SYSTEME DE MOUVEMENT ANTI-AFK ---
function startAntiAfk(bot) {
  // Intervalle d'action : toutes les 30 à 60 secondes (aléatoire)
  const getRandomTime = () => Math.floor(Math.random() * (60000 - 30000) + 30000);

  function executeRandomAction() {
    if (!bot || !bot.entity) return;

    const action = Math.floor(Math.random() * 4);

    switch (action) {
      case 0:
        // Action : Sauter
        console.log('[Anti-AFK] Saut');
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 400);
        break;

      case 1:
        // Action : Tourner la tête dans une direction aléatoire
        console.log('[Anti-AFK] Regard aléatoire');
        const yaw = (Math.random() * 360 - 180) * (Math.PI / 180);
        const pitch = (Math.random() * 180 - 90) * (Math.PI / 180);
        bot.look(yaw, pitch, true);
        break;

      case 2:
        // Action : Faire un petit pas vers l'avant ou l'arrière
        const direction = Math.random() > 0.5 ? 'forward' : 'back';
        console.log(`[Anti-AFK] Pas vers : ${direction}`);
        bot.setControlState(direction, true);
        setTimeout(() => bot.setControlState(direction, false), 600);
        break;

      case 3:
        // Action : Se baisser (s'accroupir)
        console.log('[Anti-AFK] Accroupissement');
        bot.setControlState('sneak', true);
        setTimeout(() => bot.setControlState('sneak', false), 1000);
        break;
    }

    // Programme la prochaine action aléatoire
    setTimeout(executeRandomAction, getRandomTime());
  }

  // Lancement du premier cycle
  setTimeout(executeRandomAction, 5000);
}

// Lancement initial
createBotInstance();
// Note : Assurez-vous d'avoir installé mineflayer via npm avant d'exécuter ce script