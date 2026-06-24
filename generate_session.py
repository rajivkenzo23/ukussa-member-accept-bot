import os
from telethon import TelegramClient
from telethon.sessions import StringSession

api_id = 35481411
api_hash = "5db076b70a26a9e703fcd7c27ea8fc58"

def main():
    print("Starting Telegram User Session Generator...")
    # Telethon's start method automatically prompts the user via console for login details
    with TelegramClient(StringSession(), api_id, api_hash) as client:
        print("\n==========================================================================")
        print("✅ SUCCESSFULLY LOGGED IN!")
        print("Copy the entire line below and save it. You will need it for the bot:")
        print("==========================================================================\n")
        print(client.session.save())
        print("\n==========================================================================")

if __name__ == "__main__":
    main()
