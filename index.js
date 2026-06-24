const { spawnSync, spawn } = require('child_process');
const { writeFileSync } = require('fs');
const path = require('path');

// ==============================================
// Configurations
// ==============================================
const REPO_URL = 'https://github.com/rajivkenzo23/ukussa-member-accept-bot.git';
const BOT_DIR = __dirname;
const PM2_NAME = 'ukussa-accept-bot';

const ENV_CONTENT = `BOT_TOKEN=8088741380:AAGnTjXah3Whv3C24Nw9SujKIDVS0pF_fY4
FREE_LINKS_CHAT_ID=-1003966168979
FREE_CHAT_ID=-1003924977765
ADMIN_IDS=8667419475
TELEGRAM_API_ID=35481411
TELEGRAM_API_HASH=5db076b70a26a9e703fcd7c27ea8fc58
TELEGRAM_STRING_SESSION=1BQANOTEuMTA4LjU2LjE5MwG7RuYDbbFQDB050ejSYB5rASg3qjQYKfR1Q48zedJaA+w2OfyRX67IK/WfWRcM0H3xISDGLtfplxVY6EWJkNH7uvjzFRGLEyopae38LXayD+ogkK3e5ILkRoQaFlji9DqwDpsfhXm+O/xRRQwsp/Hw8FStvwlApdQx1wx1MFg/btjKc2k5/qQSXpI4mm1TRHwXYl/Vw6nGYbPNUI2/VZ4dxT3sIMgDTlOnk0Sy/4hxT4Hl/1M+zaDB1oKkmEe0AR3vin9mdqcmPlZ3zZXoBp7t6t8F0hD5LtbQ6gzKcV5i+kzf0pK2LomgydY5+/dzI4fC3Cgov+BE5z/pvlTGT0UbhQ==
`;

let nodeRestartCount = 0;
const maxNodeRestarts = 5;
const restartWindow = 30000;
let lastRestartTime = Date.now();

function startNode() {
  console.log('Starting bot with raw node (fallback)...');
  const child = spawn('node', ['bot.js'], { cwd: BOT_DIR, stdio: 'inherit' });

  child.on('exit', (code) => {
    if (code !== 0) {
      const currentTime = Date.now();
      if (currentTime - lastRestartTime > restartWindow) nodeRestartCount = 0;
      lastRestartTime = currentTime;
      nodeRestartCount++;

      if (nodeRestartCount > maxNodeRestarts) {
        console.error('Node.js process is restarting continuously. Stopping retries...');
        return;
      }
      console.log(`Node.js process exited with code ${code}. Restarting...`);
      startNode();
    }
  });
}

function startPm2() {
  console.log('Starting bot with PM2...');
  const pm2 = spawn('npx', ['pm2', 'start', 'bot.js', '--name', PM2_NAME, '--attach'], {
    cwd: BOT_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let restartCount = 0;
  pm2.on('exit', (code) => {
    if (code !== 0) {
      console.log(`PM2 exited with code ${code}. Falling back to node...`);
      startNode();
    }
  });
  pm2.on('error', (err) => {
    console.log('PM2 failed to spawn. Falling back to node...', err.message);
    startNode();
  });

  if (pm2.stderr) {
    pm2.stderr.on('data', (data) => {
      console.error(data.toString());
      if (data.toString().includes('restart')) {
        restartCount++;
        if (restartCount > 5) {
          spawnSync('npx', ['pm2', 'delete', PM2_NAME], { cwd: BOT_DIR, stdio: 'inherit' });
          startNode();
        }
      }
    });
  }
  if (pm2.stdout) {
    pm2.stdout.on('data', (data) => {
      console.log(data.toString());
      if (data.toString().includes('online')) restartCount = 0;
    });
  }
}

function installDependencies() {
  console.log('Installing dependencies...');
  spawnSync('npm', ['install', '--force'], { cwd: BOT_DIR, stdio: 'inherit' });
}

function setupRepository() {
  const { existsSync } = require('fs');
  const gitDir = path.join(BOT_DIR, '.git');
  if (!existsSync(gitDir)) {
    console.log('.git directory not found. Initializing git repository...');
    spawnSync('git', ['init'], { cwd: BOT_DIR, stdio: 'inherit' });
    spawnSync('git', ['remote', 'add', 'origin', REPO_URL], { cwd: BOT_DIR, stdio: 'inherit' });
    spawnSync('git', ['branch', '-M', 'main'], { cwd: BOT_DIR, stdio: 'inherit' });
  }

  console.log('Pulling latest updates from GitHub...');
  spawnSync('git', ['fetch', '--all'], { cwd: BOT_DIR, stdio: 'inherit' });
  spawnSync('git', ['reset', '--hard', 'origin/main'], { cwd: BOT_DIR, stdio: 'inherit' });

  console.log('Writing to .env...');
  writeFileSync(path.join(BOT_DIR, '.env'), ENV_CONTENT);
  
  installDependencies();
}

// Run updater then start process
setupRepository();
startPm2();
