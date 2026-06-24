const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");

const apiId = 35481411;
const apiHash = "5db076b70a26a9e703fcd7c27ea8fc58";
const stringSession = new StringSession(""); // empty for new session

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const getInput = (question) => new Promise((resolve) => rl.question(question, resolve));

(async () => {
  console.log("Starting Telegram User Session Generator...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await getInput("Please enter your phone number (with country code, e.g., +94712345678): "),
    password: async () => await getInput("Please enter your Telegram 2FA password (if enabled, otherwise press Enter): "),
    phoneCode: async () => await getInput("Please enter the login code you received on Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("\n==========================================================================");
  console.log("✅ SUCCESSFULLY LOGGED IN!");
  console.log("Copy the entire line below and save it. You will need it for the bot:");
  console.log("==========================================================================\n");
  console.log(client.session.save());
  console.log("\n==========================================================================");
  
  rl.close();
  process.exit(0);
})();
