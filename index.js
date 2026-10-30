const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const http = require('http');
const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot en ligne');
  })
  .listen(PORT, () => console.log(`Serveur HTTP sur le port ${PORT}`));

// --- CONFIGURATION ---
const CONFIG = {
  host: 'Emeraldteam.aternos.me',
  port: 56996,
  username: 'bottest', // idéalement un pseudo plus "humain" (ex: Kevin_Mada)
  version: '1.21.11 (132)',
  wanderRadius: 8,         // rayon de balade autour de la base
};

// --- OUTILS ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const chance = (p) => Math.random() < p;

// Durée "humaine" : distribution proche d'une gaussienne (plus de valeurs au milieu)
function humanDelay(min, max) {
  const g = (Math.random() + Math.random() + Math.random()) / 3;
  return min + g * (max - min);
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Rotation fluide de la caméra (comme une souris)
async function smoothLook(bot, targetYaw, targetPitch, duration = rand(250, 700)) {
  const startYaw = bot.entity.yaw;
  const startPitch = bot.entity.pitch;

  // Chemin le plus court pour le yaw
  let dYaw = targetYaw - startYaw;
  dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  const dPitch = targetPitch - startPitch;

  const steps = Math.max(5, Math.floor(duration / 50));
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    await bot.look(startYaw + dYaw * t, startPitch + dPitch * t, true);
    await sleep(duration / steps);
  }
}

// --- COMPORTEMENTS ---
const behaviors = {
  // Regarder autour de soi (petits mouvements, pitch limité)
  async lookAround(bot) {
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const yaw = bot.entity.yaw + rand(-1.8, 1.8);
      const pitch = rand(-0.5, 0.4);
      await smoothLook(bot, yaw, pitch);
      await sleep(humanDelay(300, 1500));
    }
  },

  // Se balader vers un point proche de la base
  async wander(bot, ctx) {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(2, CONFIG.wanderRadius);
    const x = ctx.home.x + Math.cos(angle) * dist;
    const z = ctx.home.z + Math.sin(angle) * dist;
    try {
      bot.pathfinder.setGoal(new goals.GoalNearXZ(x, z, 1));
      // On laisse marcher quelques secondes puis on arrête
      await sleep(humanDelay(2000, 6000));
    } finally {
      bot.pathfinder.setGoal(null);
    }
  },

  // Sauter (parfois deux fois)
  async jump(bot) {
    const times = chance(0.25) ? 2 : 1;
    for (let i = 0; i < times; i++) {
      bot.setControlState('jump', true);
      await sleep(rand(100, 250));
      bot.setControlState('jump', false);
      await sleep(rand(200, 500));
    }
  },

  // Courir en avant en sautant un moment
  async sprintJump(bot) {
    await smoothLook(bot, bot.entity.yaw + rand(-1, 1), rand(-0.1, 0.2));
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);
    const end = Date.now() + humanDelay(1000, 3000);
    while (Date.now() < end) {
      bot.setControlState('jump', true);
      await sleep(150);
      bot.setControlState('jump', false);
      await sleep(rand(300, 600));
    }
    bot.setControlState('forward', false);
    bot.setControlState('sprint', false);
  },

  // S'accroupir brièvement (ou plusieurs fois d'affilée)
  async sneak(bot) {
    const times = randInt(1, 4);
    for (let i = 0; i < times; i++) {
      bot.setControlState('sneak', true);
      await sleep(rand(150, 500));
      bot.setControlState('sneak', false);
      await sleep(rand(100, 400));
    }
  },

  // Agiter le bras (comme un clic)
  async swingArm(bot) {
    const times = randInt(1, 3);
    for (let i = 0; i < times; i++) {
      bot.swingArm(chance(0.8) ? 'right' : 'left');
      await sleep(rand(200, 600));
    }
  },

  // Changer d'emplacement dans la barre d'objets
  async hotbar(bot) {
    bot.setQuickBarSlot(randInt(0, 8));
    await sleep(rand(200, 600));
  },

  // Regarder le joueur le plus proche, s'il y en a un
  async watchPlayer(bot) {
    const target = bot.nearestEntity((e) => e.type === 'player' && e !== bot.entity);
    if (!target) return behaviors.lookAround(bot);
    const pos = target.position.offset(0, target.height * 0.9, 0);
    const end = Date.now() + humanDelay(1500, 4000);
    while (Date.now() < end && target.isValid) {
      await bot.lookAt(pos, false);
      await sleep(rand(200, 500));
    }
  },

  // Ne rien faire (le comportement le plus "humain")
  async idle(bot) {
    await sleep(humanDelay(2000, 8000));
  },
};

// Poids : plus le chiffre est grand, plus l'action est fréquente
const WEIGHTS = [
  ['idle', 20],
  ['lookAround', 22],
  ['wander', 16],
  ['jump', 10],
  ['sneak', 8],
  ['swingArm', 8],
  ['hotbar', 6],
  ['watchPlayer', 6],
  ['sprintJump', 4],
];

function pickBehavior(last) {
  let pool = WEIGHTS.filter(([name]) => name !== last); // évite de répéter la même action
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of pool) {
    if ((r -= w) <= 0) return name;
  }
  return 'idle';
}

// --- BOUCLE PRINCIPALE DU "JOUEUR" ---
async function humanLoop(bot, ctx) {
  let last = null;
  // Petite pause initiale après le spawn
  await sleep(rand(2000, 5000));

  while (ctx.alive) {
    // Pause pendant le retour à la base (/warp home)
    if (ctx.busy) {
      await sleep(1000);
      continue;
    }

    const name = pickBehavior(last);
    last = name;
    console.log(`[Humain] ${name}`);

    try {
      await behaviors[name](bot, ctx);
    } catch (e) {
      console.error(`[Humain] erreur dans ${name}:`, e.message);
    }

    // Toujours remettre les contrôles à zéro
    bot.clearControlStates();

    // Pause irrégulière entre deux actions, avec de longues "pauses café" occasionnelles
    const pause = chance(0.1) ? humanDelay(15000, 45000) : humanDelay(3000, 15000);
    await sleep(pause);
  }
}

// --- RETOUR À LA BASE ---
// Tape /warp home puis mémorise la position comme nouveau centre de balade
async function goHome(bot, ctx) {
  ctx.busy = true; // met les comportements aléatoires en pause
  try {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();

    await sleep(rand(3000, 5000)); // attendre le chargement du monde
    console.log('[Bot] /warp botposition');
    bot.chat('/warp botposition');
    await sleep(rand(4000, 6000)); // attendre la téléportation

    ctx.home = bot.entity.position.clone();
  } catch (e) {
    console.error('[Bot] erreur dans goHome:', e.message);
  } finally {
    ctx.busy = false;
  }
}

// --- CONNEXION ---
let retryDelay = 15000;

function createBotInstance() {
  console.log(`Connexion à ${CONFIG.host}:${CONFIG.port}...`);

  const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
  });

  bot.loadPlugin(pathfinder);
  const ctx = { alive: false, home: null, busy: false };

  bot.once('spawn', async () => {
    console.log(`[+] ${CONFIG.username} connecté !`);
    retryDelay = 15000; // reset du délai de reconnexion

    const moves = new Movements(bot);
    moves.canDig = false;          // ne casse aucun bloc
    moves.allowSprinting = true;
    bot.pathfinder.setMovements(moves);

    ctx.home = bot.entity.position.clone();
    ctx.alive = true;

    await goHome(bot, ctx);
    humanLoop(bot, ctx);
  });

  // À chaque mort : après le respawn automatique, retour à la base
  bot.on('death', async () => {
    console.log('[Bot] Mort, respawn en cours...');
    await sleep(rand(1500, 3000));
    bot.once('spawn', () => goHome(bot, ctx));
  });

  // Réagir au chat comme un joueur, sans spammer
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    console.log(`<${username}> ${message}`);

    const mentioned = message.toLowerCase().includes(CONFIG.username.toLowerCase());
    if (mentioned && chance(0.7)) {
      const replies = ['hey', 'salut', 'oui ?', 'je suis là', 'yo'];
      await sleep(humanDelay(1500, 5000)); // temps de "frappe"
      bot.chat(replies[randInt(0, replies.length - 1)]);
    }
  });

  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return;
    console.log(`[+] ${player.username} a rejoint`);
  });

  bot.on('kicked', (reason) => console.log('[!] Expulsé :', reason));
  bot.on('error', (err) => console.error('Erreur du bot :', err.message));

  bot.on('end', (reason) => {
    ctx.alive = false;
    console.log(`[-] Déconnecté (${reason}). Nouvelle tentative dans ${Math.round(retryDelay / 1000)}s...`);
    setTimeout(createBotInstance, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 120000); // backoff : 15s → 30s → 60s → 120s max
  });
}

createBotInstance();