import os
import asyncio
import threading
import logging
from dotenv import load_dotenv
import telebot
from telethon import TelegramClient
from telethon.sessions import StringSession

# Load environment variables
load_dotenv()

# Logger configuration
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.WARNING
)
logger = logging.getLogger(__name__)

# Configurations
BOT_TOKEN = os.getenv("BOT_TOKEN", "8088741380:AAFO9qaHkl_ULBaE0AbJoMF--zDMXdbuxhE")
FREE_LINKS_CHAT_ID = int(os.getenv("FREE_LINKS_CHAT_ID", -1003966168979))
FREE_CHAT_ID = int(os.getenv("FREE_CHAT_ID", -1003924977765))

ADMIN_IDS_RAW = os.getenv("ADMIN_IDS", "8667419475,5828479532,1595166442,8719809739")
ADMIN_IDS = [int(x.strip()) for x in ADMIN_IDS_RAW.split(",") if x.strip()]

# Safeguard channel owner (8719809739) from being audited/kicked
if 8719809739 not in ADMIN_IDS:
    ADMIN_IDS.append(8719809739)

TELEGRAM_API_ID = int(os.getenv("TELEGRAM_API_ID", 35481411))
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "5db076b70a26a9e703fcd7c27ea8fc58")
TELEGRAM_STRING_SESSION = os.getenv("TELEGRAM_STRING_SESSION", "")

# Initialize Standard Bot
bot = telebot.TeleBot(BOT_TOKEN)

print("Ukussa Member Accept Bot is starting...")
print(f"Configured Free Chat ID: {FREE_CHAT_ID}")
print(f"Configured Links Chat ID: {FREE_LINKS_CHAT_ID}")
print(f"Configured Admin User IDs: {ADMIN_IDS}")

def is_admin(user_id):
    return user_id in ADMIN_IDS

def check_user_in_links_channel(user_id):
    try:
        member = bot.get_chat_member(FREE_LINKS_CHAT_ID, user_id)
        valid_statuses = ["creator", "administrator", "member", "restricted"]
        return member.status in valid_statuses
    except Exception as e:
        print(f"Checking user {user_id} in links channel: status not found/error ({e})")
        return False

def kick_user_from_free_channel(user_id):
    try:
        bot.ban_chat_member(FREE_CHAT_ID, user_id)
        bot.unban_chat_member(FREE_CHAT_ID, user_id)
        return True
    except Exception as e:
        print(f"Failed to kick user {user_id} from Free Channel: {e}")
        return False

def send_private_message(user_id, text):
    try:
        bot.send_message(user_id, text, parse_mode="HTML")
        return True
    except Exception as e:
        print(f"Failed to send private message to user {user_id} (User might not have started the bot): {e}")
        return False

# ============================================
# 1. Handle Join Requests (chat_join_request)
# ============================================
@bot.chat_join_request_handler()
def handle_join_request(request):
    chat_id = request.chat.id
    user_id = request.from_user.id
    username = request.from_user.username or ""
    first_name = request.from_user.first_name or ""

    if chat_id != FREE_CHAT_ID:
        return  # Only intercept join requests for the Free Channel

    print(f"Received join request from User: {first_name} (@{username}, ID: {user_id}) for Free Channel.")

    is_in_links = check_user_in_links_channel(user_id)

    if is_in_links:
        try:
            bot.approve_chat_join_request(FREE_CHAT_ID, user_id)
            print(f"Approved join request for User {user_id}.")
        except Exception as e:
            print(f"Failed to approve join request for User {user_id}: {e}")
    else:
        msg_text = (
            "⚠️ <b>Join Request Declined</b>\n\n"
            "To join <b>උකුස්සා Free 🦅</b>, you must first join our links channel: <b>උකුස්සා Free Links 🦅</b>.\n\n"
            "👉 Join here: https://t.me/ukussafree69\n\n"
            "After joining, please request to join the Free Channel again!"
        )
        send_private_message(user_id, msg_text)

        try:
            bot.decline_chat_join_request(FREE_CHAT_ID, user_id)
            print(f"Declined join request for User {user_id} (Not in links channel).")
        except Exception as e:
            print(f"Failed to decline join request for User {user_id}: {e}")

# ============================================
# 2. Command: /start
# ============================================
@bot.message_handler(commands=["start"])
def handle_start(message):
    user_id = message.from_user.id
    reply_text = (
        "👋 Hello! I am the member acceptance bot for <b>උකුස්සා</b> networks.\n\n"
        "I automatically approve requests to join the Free Channel if you are a member of our links channel.\n\n"
        "🔗 <b>Links Channel:</b> https://t.me/ukussafree69"
    )

    if is_admin(user_id):
        reply_text += (
            "\n\n🛠 <b>Admin Commands:</b>\n"
            "/check_members - Run live audit to verify if all members in the Free Channel are still in the Free Links Channel. If they are not, they will be removed."
        )

    bot.send_message(user_id, reply_text, parse_mode="HTML")

# ============================================
# 3. Command: /check_members (Userbot live list)
# ============================================
@bot.message_handler(commands=["check_members"])
def handle_check_members(message):
    user_id = message.from_user.id

    if not is_admin(user_id):
        bot.send_message(user_id, "🚫 You are not authorized to use this command.")
        return

    if not TELEGRAM_STRING_SESSION:
        bot.send_message(
            user_id,
            "⚠️ <b>Configuration Error</b>\n\nYou must generate and configure the <code>TELEGRAM_STRING_SESSION</code> variable in your configuration to use the live member checker.",
            parse_mode="HTML"
        )
        return

    status_msg = bot.send_message(
        user_id,
        "⏳ <b>Initializing live member scan...</b>\nConnecting to Telegram user session to scrape members.",
        parse_mode="HTML"
    )

    # Spawn thread to run asynchronous Telethon operations
    t = threading.Thread(target=run_audit_thread, args=(user_id, status_msg.message_id))
    t.daemon = True
    t.start()

def run_audit_thread(user_id, status_msg_id):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_audit(user_id, status_msg_id))
    except Exception as e:
        print(f"Audit failed in thread: {e}")
        try:
            bot.edit_message_text(
                f"❌ <b>Audit Failed:</b> {str(e)}",
                chat_id=user_id,
                message_id=status_msg_id,
                parse_mode="HTML"
            )
        except Exception as edit_err:
            print(f"Failed to edit error message: {edit_err}")
    finally:
        loop.close()

async def run_audit(user_id, status_msg_id):
    client = None
    try:
        # Initialize Userbot Client to fetch members
        client = TelegramClient(
            StringSession(TELEGRAM_STRING_SESSION),
            TELEGRAM_API_ID,
            TELEGRAM_API_HASH,
            connection_retries=5
        )

        await client.connect()

        # Update status
        bot.edit_message_text(
            "📥 <b>Scraping live member lists...</b>\nFetching participants from both channels.",
            chat_id=user_id,
            message_id=status_msg_id,
            parse_mode="HTML"
        )

        # 1. Fetch participants of Free Channel
        participants = await client.get_participants(FREE_CHAT_ID, limit=10000)
        total = len(participants)

        # 2. Fetch participants of Links Channel
        links_participants = await client.get_participants(FREE_LINKS_CHAT_ID, limit=10000)
        links_set = {str(u.id) for u in links_participants}

        bot.edit_message_text(
            f"🔍 <b>Auditing {total} members...</b>\nComparing lists in memory (instant lookup).",
            chat_id=user_id,
            message_id=status_msg_id,
            parse_mode="HTML"
        )

        checked = 0
        removed = 0

        for user in participants:
            checked += 1
            m_id_str = str(user.id)
            m_id = user.id

            # Skip bots and admins
            if user.bot or is_admin(m_id):
                continue

            is_still_in_links = m_id_str in links_set

            if not is_still_in_links:
                name_str = user.first_name or f"User {m_id}"
                print(f"[Audit] User {name_str} (ID: {m_id}) is NOT in the links channel. Removing...")

                # Send warning message
                reason_text = (
                    "⚠️ <b>Removed from Channel</b>\n\n"
                    "You have been removed from <b>උකුස්සා Free 🦅</b> because you are no longer a member of our links channel: <b>උකුස්සා Free Links 🦅</b>.\n\n"
                    "👉 Rejoin the links channel here: https://t.me/ukussafree69\n\n"
                    "Once you have rejoined, you can request to join the Free Channel again!"
                )
                send_private_message(m_id, reason_text)

                # Kick
                kick_ok = kick_user_from_free_channel(m_id)
                if kick_ok:
                    removed += 1

            # Tiny delay to avoid rate limit bans
            await asyncio.sleep(0.08)

        report_text = (
            f"✅ <b>Live Audit Complete!</b>\n\n"
            f"📊 <b>Results:</b>\n"
            f"• Live Members Scraped: <code>{total}</code>\n"
            f"• Members Audited: <code>{checked}</code>\n"
            f"• Members Removed: <code>{removed}</code>\n\n"
            f"<i>Audit ran fully automatically using your user session.</i>"
        )

        bot.edit_message_text(
            report_text,
            chat_id=user_id,
            message_id=status_msg_id,
            parse_mode="HTML"
        )

    finally:
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

# Start standard bot polling
if __name__ == "__main__":
    print("Bot is running and listening for requests...")
    bot.infinity_polling(allowed_updates=['message', 'chat_join_request'])
