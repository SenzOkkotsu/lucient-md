const { Boom } = require("@hapi/boom");
const pino = require("pino");
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const config = require("../config");
const database = require("./database");

const logger = pino();

async function startBot() {
  try {
    console.log("🤖 Lucient MD Bot - Memulai...");

    // Get Baileys version
    const { version } = await fetchLatestBaileysVersion();

    // Auth state
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

    // Create socket
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
    });

    // Handle pairing code
    if (!sock.authState.creds.registered) {
      console.log("\n📱 Meminta Pairing Code...");
      const phoneNumber = config.pairingNumber.replace(/[^0-9]/g, "");
      
      if (phoneNumber.length < 1) {
        throw new Error("❌ Nomor pairing tidak valid di config.js");
      }

      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`\n✅ Pairing Code: ${code}`);
      console.log(`⏳ Tunggu hingga nomor ter-pairing...\n`);
    }

    // Handle connection updates
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection === "connecting") {
        console.log("🔄 Connecting...");
      }

      if (connection === "open") {
        console.log("✅ Bot berhasil terhubung!");
        console.log(`📱 Nomor: ${sock.user.id}`);
      }

      if (connection === "close") {
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          console.log("⚠️ Koneksi terputus, reconnecting...");
          startBot();
        } else {
          console.log("❌ Bot logout!");
        }
      }
    });

    // Handle credentials update
    sock.ev.on("creds.update", saveCreds);

    // Handle incoming messages
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const message = m.messages[0];

        if (!message.message) return;

        const from = message.key.remoteJid;
        const isOwner = from === `${config.ownerNumber}@s.whatsapp.net`;
        const messageBody =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          "";

        if (!messageBody) return;

        console.log(`📨 Pesan dari ${from}: ${messageBody}`);

        // Example command handler
        if (messageBody.startsWith(config.botPrefix)) {
          const command = messageBody.slice(config.botPrefix.length).trim().split(" ")[0].toLowerCase();
          const args = messageBody.slice(config.botPrefix.length).trim().split(" ").slice(1);

          console.log(`📌 Command: ${command}`);

          // Handle basic commands
          switch (command) {
            case "ping":
              await sock.sendMessage(from, { text: "🏓 Pong!" });
              break;

            case "menu":
              const menuText = `
╔═══════════════════════╗
║  🤖 ${config.botName}  
╠═══════════════════════╣
║
║ *MENU COMMANDS*
║ ${config.botPrefix}ping - Cek bot
║ ${config.botPrefix}menu - Tampilkan menu
║ ${config.botPrefix}owner - Info owner
║
╚═══════════════════════╝
              `;
              await sock.sendMessage(from, { text: menuText });
              break;

            case "owner":
              await sock.sendMessage(from, { text: `👤 Owner: ${config.ownerNumber}` });
              break;

            default:
              await sock.sendMessage(from, { text: `❌ Command \`${command}\` tidak ditemukan!\nKetik ${config.botPrefix}menu untuk melihat daftar command.` });
          }
        }
      } catch (error) {
        console.error("❌ Error handling message:", error);
      }
    });

  } catch (error) {
    console.error("❌ Error starting bot:", error);
    process.exit(1);
  }
}

// Start bot
startBot();

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n👋 Bot dihentikan...");
  process.exit(0);
});
