require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// Hardcoded Fallback Configurations (so no .env file is strictly required)
const token = process.env.BOT_TOKEN || '8088741380:AAGnTjXah3Whv3C24Nw9SujKIDVS0pF_fY4';
const FREE_LINKS_CHAT_ID = parseInt(process.env.FREE_LINKS_CHAT_ID) || -1003966168979;
const FREE_CHAT_ID = parseInt(process.env.FREE_CHAT_ID) || -1003924977765;

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(Boolean)
  : [8667419475]; // Default User ID: 8667419475

if (!token) {
  console.error('ERROR: BOT_TOKEN is missing!');
  process.exit(1);
}

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'members.json');

// Initialize database
let db = {
  members: {} // userId: { username, firstName, joinedAt }
};

function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(raw);
      if (!db.members) db.members = {};
    }
  } catch (e) {
    console.error('Error loading database:', e.message);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving database:', e.message);
  }
}

loadDb();

// Initialize Bot
// We explicitly request 'chat_member' and 'chat_join_request' updates in polling options
const bot = new TelegramBot(token, {
  polling: {
    params: {
      allowed_updates: ['message', 'chat_member', 'chat_join_request']
    }
  }
});

console.log('Ukussa Member Accept Bot is starting...');
console.log(`Configured Free Chat ID: ${FREE_CHAT_ID}`);
console.log(`Configured Links Chat ID: ${FREE_LINKS_CHAT_ID}`);
console.log(`Configured Admin User IDs: ${ADMIN_IDS.join(', ')}`);

// Helper: Check if user is in admin list
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Helper: Check if user is in Free Links Channel
async function isUserInLinksChannel(userId) {
  try {
    const member = await bot.getChatMember(FREE_LINKS_CHAT_ID, userId);
    const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
    return validStatuses.includes(member.status);
  } catch (e) {
    // If user is not in the channel, Telegram API throws a 400 Bad Request error
    console.log(`Checking user ${userId} in links channel: status not found/error (${e.message})`);
    return false;
  }
}

// Helper: Kick user from Free Channel (ban and immediately unban)
async function kickUserFromFreeChannel(userId) {
  try {
    if (typeof bot.banChatMember === 'function') {
      await bot.banChatMember(FREE_CHAT_ID, userId);
      await bot.unbanChatMember(FREE_CHAT_ID, userId);
    } else {
      await bot.kickChatMember(FREE_CHAT_ID, userId);
      await bot.unbanChatMember(FREE_CHAT_ID, userId);
    }
    return true;
  } catch (e) {
    console.error(`Failed to kick user ${userId} from Free Channel:`, e.message);
    return false;
  }
}

// Helper: Try to send private message to a user
async function sendPrivateMessage(userId, text) {
  try {
    await bot.sendMessage(userId, text, { parse_mode: 'HTML' });
    return true;
  } catch (e) {
    console.log(`Failed to send private message to user ${userId} (User might not have started the bot):`, e.message);
    return false;
  }
}

// ============================================
// 1. Handle Join Requests (chat_join_request)
// ============================================
bot.on('chat_join_request', async (request) => {
  const chatId = request.chat.id;
  const userId = request.from.id;
  const username = request.from.username || '';
  const firstName = request.from.first_name || '';

  if (chatId !== FREE_CHAT_ID) {
    return; // Only intercept join requests for the Free Channel
  }

  console.log(`Received join request from User: ${firstName} (@${username}, ID: ${userId}) for Free Channel.`);

  const isInLinksChannel = await isUserInLinksChannel(userId);

  if (isInLinksChannel) {
    try {
      await bot.approveChatJoinRequest(FREE_CHAT_ID, userId);
      console.log(`Approved join request for User ${userId}.`);

      // Track user in database
      db.members[userId] = {
        username,
        firstName,
        joinedAt: new Date().toISOString()
      };
      saveDb();
    } catch (e) {
      console.error(`Failed to approve join request for User ${userId}:`, e.message);
    }
  } else {
    // Send reason and link before declining if user started the bot
    const msgText = `⚠️ <b>Join Request Declined</b>\n\nTo join <b>උකුස්සා Free 🦅</b>, you must first join our links channel: <b>උකුස්සා Free Links 🦅</b>.\n\n👉 Join here: https://t.me/ukussafree69\n\nAfter joining, please request to join the Free Channel again!`;
    await sendPrivateMessage(userId, msgText);

    try {
      await bot.declineChatJoinRequest(FREE_CHAT_ID, userId);
      console.log(`Declined join request for User ${userId} (Not in links channel).`);
    } catch (e) {
      console.error(`Failed to decline join request for User ${userId}:`, e.message);
    }
  }
});

// ============================================
// 2. Track Member Updates (chat_member)
// ============================================
bot.on('chat_member', (update) => {
  const chatId = update.chat.id;
  
  if (chatId !== FREE_CHAT_ID) {
    return; // Only track status changes in the Free Channel
  }

  const userId = update.new_chat_member.user.id;
  const username = update.new_chat_member.user.username || '';
  const firstName = update.new_chat_member.user.first_name || '';
  const newStatus = update.new_chat_member.status;

  const validStatuses = ['creator', 'administrator', 'member', 'restricted'];
  const isJoined = validStatuses.includes(newStatus);

  if (isJoined) {
    if (!db.members[userId]) {
      console.log(`Tracked new member join: User ${firstName} (@${username}, ID: ${userId})`);
      db.members[userId] = {
        username,
        firstName,
        joinedAt: new Date().toISOString()
      };
      saveDb();
    }
  } else {
    // status is 'left' or 'kicked'
    if (db.members[userId]) {
      console.log(`Tracked member left/removed: User ID: ${userId}`);
      delete db.members[userId];
      saveDb();
    }
  }
});

// ============================================
// 3. Command: /start
// ============================================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const username = msg.from.username || '';

  let replyText = `👋 Hello! I am the member acceptance bot for <b>උකුස්සා</b> networks.\n\nI automatically approve requests to join the Free Channel if you are a member of our links channel.\n\n🔗 <b>Links Channel:</b> https://t.me/ukussafree69`;

  if (isAdmin(userId)) {
    replyText += `\n\n🛠 <b>Admin Commands:</b>\n/check_members - Run audit to verify if all members in the Free Channel are still in the Free Links Channel. If they are not, they will be removed.`;
  }

  await bot.sendMessage(userId, replyText, { parse_mode: 'HTML' });
});

// ============================================
// 4. Command: /check_members
// ============================================
bot.onText(/\/check_members/, async (msg) => {
  const userId = msg.from.id;

  if (!isAdmin(userId)) {
    return bot.sendMessage(userId, '🚫 You are not authorized to use this command.');
  }

  const statusMsg = await bot.sendMessage(userId, '🔍 <b>Auditing members...</b>\nChecking all tracked members in the Free Channel against the Links Channel. This may take some time depending on database size.', { parse_mode: 'HTML' });

  const membersList = Object.keys(db.members);
  const total = membersList.length;
  let checked = 0;
  let removed = 0;

  if (total === 0) {
    return bot.editMessageText('ℹ️ No tracked members in the database to audit yet. The bot will automatically track new members as they request to join or enter the channel.', {
      chat_id: statusMsg.chat.id,
      message_id: statusMsg.message_id
    });
  }

  for (const mIdStr of membersList) {
    const mId = parseInt(mIdStr);
    checked++;

    const isStillInLinks = await isUserInLinksChannel(mId);

    if (!isStillInLinks) {
      const memberInfo = db.members[mIdStr];
      const nameStr = memberInfo ? `${memberInfo.firstName} (@${memberInfo.username || 'no_username'})` : `User ${mId}`;
      console.log(`[Audit] User ${nameStr} (ID: ${mId}) is NOT in the links channel. Removing...`);

      // Try sending them a warning message first
      const reasonText = `⚠️ <b>Removed from Channel</b>\n\nYou have been removed from <b>උකුස්සා Free 🦅</b> because you are no longer a member of our links channel: <b>උකුස්සා Free Links 🦅</b>.\n\n👉 Rejoin the links channel here: https://t.me/ukussafree69\n\nOnce you have rejoined, you can request to join the Free Channel again!`;
      await sendPrivateMessage(mId, reasonText);

      // Kick them
      const kickOk = await kickUserFromFreeChannel(mId);
      if (kickOk) {
        removed++;
        delete db.members[mIdStr];
        saveDb();
      }
    }

    // Optional delay to prevent Telegram rate limit issues (30 requests/second limit)
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  const reportText = `✅ <b>Audit Complete!</b>\n\n📊 <b>Results:</b>\n• Total Tracked Members: <code>${total}</code>\n• Members Checked: <code>${checked}</code>\n• Members Removed: <code>${removed}</code>\n\n<i>Note: The database has been updated accordingly. Only tracked members could be audited.</i>`;

  await bot.editMessageText(reportText, {
    chat_id: statusMsg.chat.id,
    message_id: statusMsg.message_id,
    parse_mode: 'HTML'
  });
});

// Helper: Download file content from Telegram servers via https
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================
// 5. Handle Admin File Upload (Import User IDs)
// ============================================
bot.on('document', async (msg) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;

  const doc = msg.document;
  const isTxt = doc.mime_type === 'text/plain' || doc.file_name.endsWith('.txt') || doc.file_name.endsWith('.csv');
  
  if (isTxt) {
    const statusMsg = await bot.sendMessage(userId, '⏳ <b>Downloading file and importing user IDs...</b>', { parse_mode: 'HTML' });
    
    try {
      // Get file link
      const fileLink = await bot.getFileLink(doc.file_id);
      // Fetch the file content
      const text = await downloadFile(fileLink);
      
      // Parse lines
      const lines = text.split(/\r?\n/);
      let count = 0;
      
      for (let line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        
        // Match numbers (user IDs)
        const match = cleaned.match(/^([+-]?\d+)/);
        if (match) {
          const id = parseInt(match[1]);
          const idStr = String(id);
          if (!db.members[idStr]) {
            db.members[idStr] = {
              username: '',
              firstName: `Imported User ${id}`,
              joinedAt: new Date().toISOString()
            };
            count++;
          }
        }
      }
      
      if (count > 0) {
        saveDb();
      }
      
      await bot.editMessageText(`✅ <b>Import Successful!</b>\n\nImported <code>${count}</code> new user IDs into the database.\nTotal tracked members: <code>${Object.keys(db.members).length}</code>.\n\nYou can now run /check_members to audit them.`, {
        chat_id: statusMsg.chat.id,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML'
      });
    } catch (err) {
      await bot.editMessageText(`❌ <b>Import Failed:</b> ${err.message}`, {
        chat_id: statusMsg.chat.id,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML'
      });
    }
  }
});

// Global error handler
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

console.log('Bot is running and listening for requests...');
