# 🦅 Ukussa Member Accept Bot

A specialized Telegram Bot that automatically approves join requests to the **Free Channel** only if the user is a member of the **Free Links Channel**. It also tracks members in a local database and provides an admin audit command `/check_members` to automatically kick members from the Free Channel who have left the Free Links Channel.

---

## 📋 Features
- ⚡ **Auto-Accept Requests:** Automatically checks if a requesting user is in the Free Links Channel. If yes, it approves them instantly.
- 🚫 **Auto-Decline & Inform:** If the user is not in the Free Links Channel, it declines the request and sends them a private message with a direct link to join the required channel first.
- 👥 **Real-Time Member Tracking:** Logs new members dynamically from `chat_member` status changes to build the local audit database automatically.
- 🔍 **Audit Command (`/check_members`):** Allows administrators to scan all tracked members of the Free Channel, verify if they are still in the Free Links Channel, kick non-compliant members (ban & immediate unban), and notify them of the removal with rejoin links.

---

## 🛠 Setup & Installation

### 1. Install Dependencies
Navigate to the bot directory and install the packages:
```bash
npm install
```

### 2. Configure `.env`
Open the `.env` file and set up your details:
* `BOT_TOKEN`: Your Telegram Bot token (`8088741380:AAGnTjXah3Whv3C24Nw9SujKIDVS0pF_fY4` is pre-configured).
* `FREE_LINKS_CHAT_ID`: The ID of the links channel (`-1003966168979` is pre-configured).
* `FREE_CHAT_ID`: The ID of the free channel (`-1003924977765` is pre-configured).
* `ADMIN_IDS`: A comma-separated list of Telegram User IDs that are allowed to run `/check_members` (e.g. `5828479532,1595166442`). You can find your ID by sending a message to [@userinfobot](https://t.me/userinfobot) on Telegram.

---

## 🔑 Telegram Channel Permissions (Crucial)

To make the bot work correctly, you **must add the bot as an Administrator** in both channels with the following permissions:

### A. In the Free Channel (`-1003924977765`)
The bot must be an Admin with these privileges:
1. **Invite Users via Link** (or **Approve New Members / Manage Join Requests**).
2. **Ban Users** (necessary to perform member removals during audits).

### B. In the Free Links Channel (`-1003966168979`)
* The bot must be added as an Administrator to have permissions to fetch membership status via the API (especially if the channel is private). No special write/post privileges are required.

---

## 🚀 Running the Bot

To start the bot in the background or for testing:
```bash
npm start
```

For production, it is highly recommended to run it with a process manager like **PM2** so it automatically restarts if the server reboots:
```bash
pm2 start index.js --name "ukussa-accept-bot"
pm2 save
```

---

## 💡 Important Notes on Bot API Limits & Import Option
* **Pre-existing Members:** Due to Telegram Bot API security limitations, a standard bot **cannot** pull a list of members that joined the channel *before* the bot was added.
* **Self-Building Database:** The bot will automatically track all members who join via request approval or join after the bot is added.
* **📥 Importing Existing Members (.txt):** If you already have existing members in your channel and want to audit them, you can import them:
  1. Create a `.txt` or `.csv` file containing the Telegram User IDs (one ID per line, e.g., `123456789`).
  2. Send this text file directly to the bot in a private message.
  3. The bot will automatically parse and import all the User IDs into the database.
  4. You can then run `/check_members` to audit everyone in that list!
