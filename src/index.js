const { Boom } = require("@hapi/boom");
const pino = require("pino");
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { dbHelper } = require("./database");

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

    // Helper function untuk send media
    const sendMedia = async (jid, mediaPath, mediaType, caption = "") => {
      try {
        const filePath = path.join(__dirname, "../assets", mediaPath);
        
        if (!fs.existsSync(filePath)) {
          console.log(`⚠️ File tidak ditemukan: ${filePath}`);
          await sock.sendMessage(jid, { text: `❌ Media ${mediaPath} tidak ditemukan! Silakan letakkan file di folder assets/` });
          return;
        }

        const mediaBuffer = fs.readFileSync(filePath);
        const mimeTypes = {
          image: "image/jpeg",
          video: "video/mp4",
          audio: "audio/mpeg",
        };

        const message = {
          [mediaType]: mediaBuffer,
          mimetype: mimeTypes[mediaType] || "application/octet-stream",
          caption: caption || undefined,
        };

        await sock.sendMessage(jid, message);
        console.log(`✅ ${mediaType.toUpperCase()} terkirim: ${mediaPath}`);
      } catch (error) {
        console.error(`❌ Error sending ${mediaType}:`, error);
        await sock.sendMessage(jid, { text: `❌ Terjadi error saat mengirim media!` });
      }
    };

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

        // Log message to database
        try {
          const phoneNumber = from.split("@")[0];
          await dbHelper.addUser(phoneNumber);
          await dbHelper.logMessage(phoneNumber, messageBody);
        } catch (dbError) {
          console.log("⚠️ Tidak bisa log message ke database");
        }

        // Example command handler
        if (messageBody.startsWith(config.botPrefix)) {
          const command = messageBody.slice(config.botPrefix.length).trim().split(" ")[0].toLowerCase();
          const args = messageBody.slice(config.botPrefix.length).trim().split(" ").slice(1);

          console.log(`📌 Command: ${command}`);

          // Handle basic commands
          switch (command) {
            case "ping":
              await sock.sendMessage(from, { text: "🏓 Pong! Bot sedang aktif ✅" });
              break;

            case "menu":
              const menuCaption = `
╔═══════════════════════════════╗
║      🤖 ${config.botName}      
╠═══════════════════════════════╣
║
║ *📋 MENU COMMANDS*
║
║ ${config.botPrefix}ping - Cek status bot
║ ${config.botPrefix}menu - Tampilkan menu ini
║ ${config.botPrefix}owner - Info owner bot
║ ${config.botPrefix}help - Bantuan lengkap
║ ${config.botPrefix}demo - Demo semua media
║
║ *🎬 MEDIA*
║ Gambar, Video, Audio tersedia!
║
╚═══════════════════════════════╝
              `;

              // Kirim menu dengan gambar
              await sendMedia(from, "menu/menu_image.jpg", "image", menuCaption);
              
              break;

            case "owner":
              const ownerText = `
👤 *INFO OWNER*

Nomor: wa.me/${config.ownerNumber}
Nama: Owner ${config.botName}
Status: Online ✅

Hubungi untuk info lebih lanjut!
              `;
              
              // Kirim dengan foto owner jika ada
              await sendMedia(from, "owner/owner_image.jpg", "image", ownerText);
              
              break;

            case "demo":
              await sock.sendMessage(from, { text: "🎬 *Demo Media Dimulai...*\n\n📹 Mengirim Video Demo..." });
              await new Promise(r => setTimeout(r, 500));
              await sendMedia(from, "demo/demo_video.mp4", "video", "📹 Video Demo Fitur Bot Lucient MD");
              
              await new Promise(r => setTimeout(r, 1000));
              await sock.sendMessage(from, { text: "🎵 Mengirim Audio Demo..." });
              await new Promise(r => setTimeout(r, 500));
              await sendMedia(from, "demo/demo_audio.mp3", "audio");
              
              await new Promise(r => setTimeout(r, 1000));
              await sock.sendMessage(from, { text: "📸 Mengirim Foto Demo..." });
              await new Promise(r => setTimeout(r, 500));
              await sendMedia(from, "demo/demo_image.jpg", "image", "📸 Foto Demo Bot");
              
              await new Promise(r => setTimeout(r, 1000));
              await sock.sendMessage(from, { text: "✅ Demo selesai!" });
              
              break;

            case "help":
              const helpText = `
╔═══════════════════════════════╗
║        📚 BANTUAN LENGKAP
╠═══════════════════════════════╣
║
║ 🎯 *BASIC COMMANDS*
║ ${config.botPrefix}ping - Cek status bot
║ ${config.botPrefix}menu - Tampilkan menu
║ ${config.botPrefix}owner - Info owner
║ ${config.botPrefix}help - Bantuan ini
║ ${config.botPrefix}demo - Demo media
║
║ 📝 *CARA MENGGUNAKAN*
║ Ketik prefix (${config.botPrefix}) diikuti
║ dengan nama command
║
║ Contoh: ${config.botPrefix}ping
║
║ 🎬 *MEDIA SUPPORT*
║ Bot bisa mengirim:
║ • 📸 Gambar (JPG, PNG)
║ • 📹 Video (MP4)
║ • 🎵 Audio (MP3)
║
╚═══════════════════════════════╝
              `;
              await sock.sendMessage(from, { text: helpText });
              break;

            default:
              await sock.sendMessage(from, { text: `❌ Command \`${command}\` tidak ditemukan!\n\nKetik ${config.botPrefix}menu untuk melihat daftar command lengkap.` });
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
