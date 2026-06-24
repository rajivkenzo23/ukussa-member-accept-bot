require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

// Hardcoded Fallback Configurations
const token = process.env.BOT_TOKEN || '8088741380:AAGnTjXah3Whv3C24Nw9SujKIDVS0pF_fY4';
const FREE_LINKS_CHAT_ID = parseInt(process.env.FREE_LINKS_CHAT_ID) || -1003966168979;
const FREE_CHAT_ID = parseInt(process.env.FREE_CHAT_ID) || -1003924977765;

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(Boolean)
  : [8667419475];

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID) || 35481411;
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || "5db076b70a26a9e703fcd7c27ea8fc58";
const TELEGRAM_STRING_SESSION = process.env.TELEGRAM_STRING_SESSION || "";

if (!token) {
  console.error('ERROR: BOT_TOKEN is missing!');
  process.exit(1);
}

// Initialize Bot
const bot = new TelegramBot(token, {
  polling: {
    params: {
      allowed_updates: ['message', 'chat_join_request']
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
// 2. Command: /start
// ============================================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  let replyText = `👋 Hello! I am the member acceptance bot for <b>උකුස්සා</b> networks.\n\nI automatically approve requests to join the Free Channel if you are a member of our links channel.\n\n🔗 <b>Links Channel:</b> https://t.me/ukussafree69`;

  if (isAdmin(userId)) {
    replyText += `\n\n🛠 <b>Admin Commands:</b>\n/check_members - Run live audit to verify if all members in the Free Channel are still in the Free Links Channel. If they are not, they will be removed.`;
  }

  await bot.sendMessage(userId, replyText, { parse_mode: 'HTML' });
});

// ============================================
// 3. Command: /check_members (Userbot live list)
// ============================================
bot.onText(/\/check_members/, async (msg) => {
  const userId = msg.from.id;

  if (!isAdmin(userId)) {
    return bot.sendMessage(userId, '🚫 You are not authorized to use this command.');
  }

  if (!TELEGRAM_STRING_SESSION) {
    return bot.sendMessage(userId, '⚠️ <b>Configuration Error</b>\n\nYou must generate and configure the <code>TELEGRAM_STRING_SESSION</code> variable in your configuration to use the live member checker.', { parse_mode: 'HTML' });
  }

  const statusMsg = await bot.sendMessage(userId, '⏳ <b>Initializing live member scan...</b>\nConnecting to Telegram user session to scrape members.', { parse_mode: 'HTML' });

  let client;
  try {
    // Initialize GramJS client to fetch members
    client = new TelegramClient(
      new StringSession(TELEGRAM_STRING_SESSION),
      TELEGRAM_API_ID,
      TELEGRAM_API_HASH,
      { connectionRetries: 5 }
    );

    await client.connect();
    await bot.editMessageText('📥 <b>Scraping live member list from Free Channel...</b>', {
      chat_id: statusMsg.chat.id,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML'
    });

    // Fetch participants of the Free Channel
    const participants = await client.getParticipants(FREE_CHAT_ID, { limit: 10000 });
    const total = participants.length;

    await bot.editMessageText(`🔍 <b>Auditing ${total} members...</b>\nChecking if each member is still in the Free Links Channel.`, {
      chat_id: statusMsg.chat.id,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML'
    });

    let checked = 0;
    let removed = 0;

    for (const user of participants) {
      checked++;
      const mId = parseInt(user.id.toString());
      
      // Skip bots and admins from getting kicked
      if (user.bot || isAdmin(mId)) continue;

      const isStillInLinks = await isUserInLinksChannel(mId);

      if (!isStillInLinks) {
        const nameStr = user.firstName || `User ${mId}`;
        console.log(`[Audit] User ${nameStr} (ID: ${mId}) is NOT in the links channel. Removing...`);

        // Send warning message
        const reasonText = `⚠️ <b>Removed from Channel</b>\n\nYou have been removed from <b>උකුස්සා Free 🦅</b> because you are no longer a member of our links channel: <b>උකුස්සා Free Links 🦅</b>.\n\n👉 Rejoin the links channel here: https://t.me/ukussafree69\n\nOnce you have rejoined, you can request to join the Free Channel again!`;
        await sendPrivateMessage(mId, reasonText);

        // Kick
        const kickOk = await kickUserFromFreeChannel(mId);
        if (kickOk) {
          removed++;
        }
      }

      // Add a small delay to avoid Telegram rate limits
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    const reportText = `✅ <b>Live Audit Complete!</b>\n\n📊 <b>Results:</b>\n• Live Members Scraped: <code>${total}</code>\n• Members Audited: <code>${checked}</code>\n• Members Removed: <code>${removed}</code>\n\n<i>Audit ran fully automatically using your user session.</i>`;
    
    await bot.editMessageText(reportText, {
      chat_id: statusMsg.chat.id,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML'
    });

  } catch (err) {
    console.error('Audit failed:', err);
    await bot.editMessageText(`❌ <b>Audit Failed:</b> ${err.message}`, {
      chat_id: statusMsg.chat.id,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML'
    });
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch (_) {}
    }
  }
});

// Global error handler
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

console.log('Bot is running and listening for requests...');
