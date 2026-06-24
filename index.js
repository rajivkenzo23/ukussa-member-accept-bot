const { spawnSync, spawn } = require('child_process');
const { writeFileSync, existsSync } = require('fs');
const path = require('path');

// Configurations
const REPO_URL = 'https://github.com/rajivkenzo23/ukussa-member-accept-bot.git';
const BOT_DIR = __dirname;
const PM2_NAME = 'ukussa-accept-bot';

const ENV_CONTENT = `BOT_TOKEN=8088741380:AAGnTjXah3Whv3C24Nw9SujKIDVS0pF_fY4
FREE_LINKS_CHAT_ID=-1003966168979
FREE_CHAT_ID=-1003924977765
ADMIN_IDS=8667419475,5828479532,1595166442,8719809739
TELEGRAM_API_ID=35481411
TELEGRAM_API_HASH=5db076b70a26a9e703fcd7c27ea8fc58
TELEGRAM_STRING_SESSION=1BQANOTEuMTA4LjU2LjE5MwG7RuYDbbFQDB050ejSYB5rASg3qjQYKfR1Q48zedJaA+w2OfyRX67IK/WfWRcM0H3xISDGLtfplxVY6EWJkNH7uvjzFRGLEyopae38LXayD+ogkK3e5ILkRoQaFlji9DqwDpsfhXm+O/xRRQwsp/Hw8FStvwlApdQx1wx1MFg/btjKc2k5/qQSXpI4mm1TRHwXYl/Vw6nGYbPNUI2/VZ4dxT3sIMgDTlOnk0Sy/4hxT4Hl/1M+zaDB1oKkmEe0AR3vin9mdqcmPlZ3zZXoBp7t6t8F0hD5LtbQ6gzKcV5i+kzf0pK2LomgydY5+/dzI4fC3Cgov+BE5z/pvlTGT0UbhQ==
`;

let pythonCmd = 'python3';

// Helper to check if python3 exists, otherwise fallback to python
try {
  const check = spawnSync('python3', ['--version']);
  if (check.status !== 0) {
    pythonCmd = 'python';
  }
} catch (_) {
  pythonCmd = 'python';
}

let pythonRestartCount = 0;
const maxPythonRestarts = 5;
const restartWindow = 30000;
let lastRestartTime = Date.now();

function startPythonBot() {
  console.log(`Starting Python bot with raw ${pythonCmd} (fallback)...`);
  const child = spawn(pythonCmd, ['bot.py'], { cwd: BOT_DIR, stdio: 'inherit' });

  child.on('exit', (code) => {
    if (code !== 0) {
      const currentTime = Date.now();
      if (currentTime - lastRestartTime > restartWindow) pythonRestartCount = 0;
      lastRestartTime = currentTime;
      pythonRestartCount++;

      if (pythonRestartCount > maxPythonRestarts) {
        console.error('Python process is restarting continuously. Stopping retries...');
        return;
      }
      console.log(`Python process exited with code ${code}. Restarting...`);
      setTimeout(startPythonBot, 3000);
    }
  });
}

function startPm2() {
  console.log('Starting Python bot with PM2...');
  
  // First clean up any existing process under PM2
  spawnSync('npx', ['pm2', 'delete', PM2_NAME], { cwd: BOT_DIR });

  // Start with PM2 using python interpreter and --no-daemon to keep container alive
  const pm2 = spawn('npx', ['pm2', 'start', 'bot.py', '--name', PM2_NAME, '--interpreter', pythonCmd, '--no-daemon'], {
    cwd: BOT_DIR,
    stdio: 'inherit',
  });

  pm2.on('exit', (code) => {
    if (code !== 0) {
      console.log(`PM2 exited with code ${code}. Falling back to raw python...`);
      startPythonBot();
    }
  });
  pm2.on('error', (err) => {
    console.log('PM2 failed to spawn. Falling back to raw python...', err.message);
    startPythonBot();
  });
}

function installPythonDependencies() {
  console.log('Installing Python dependencies...');
  
  let pipCmd = 'pip3';
  try {
    const check = spawnSync('pip3', ['--version']);
    if (check.status !== 0) {
      pipCmd = 'pip';
    }
  } catch (_) {
    pipCmd = 'pip';
  }

  const install = spawnSync(pipCmd, ['install', '-r', 'requirements.txt', '--upgrade'], {
    cwd: BOT_DIR,
    stdio: 'inherit'
  });
  
  if (install.status !== 0) {
    console.log('Pip installation encountered issues. Continuing startup...');
  }
}

function setupRepository() {
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
  
  installPythonDependencies();
}

// Run repository setup/update then start the Python process
setupRepository();
startPm2();
