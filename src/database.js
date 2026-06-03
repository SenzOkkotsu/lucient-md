const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const config = require("../config");

// Create database directory if not exists
const dbPath = path.join(__dirname, "../database");
const fs = require("fs");
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

// Initialize database
const db = new sqlite3.Database(config.database.path, (err) => {
  if (err) {
    console.error("❌ Error membuka database:", err.message);
  } else {
    console.log("✅ Database terhubung");
    initializeTables();
  }
});

// Initialize tables
function initializeTables() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT UNIQUE NOT NULL,
      username TEXT,
      is_premium INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("❌ Error creating users table:", err.message);
    else console.log("✅ Users table ready");
  });

  // Groups table
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT UNIQUE NOT NULL,
      group_name TEXT,
      group_desc TEXT,
      owner TEXT,
      member_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("❌ Error creating groups table:", err.message);
    else console.log("✅ Groups table ready");
  });

  // Settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(phone_number, setting_key)
    )
  `, (err) => {
    if (err) console.error("❌ Error creating settings table:", err.message);
    else console.log("✅ Settings table ready");
  });

  // Messages log table
  db.run(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT,
      message TEXT,
      message_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("❌ Error creating message_logs table:", err.message);
    else console.log("✅ Message logs table ready");
  });
}

// Database helper functions
const dbHelper = {
  // User functions
  addUser: (phoneNumber, username) => {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT OR IGNORE INTO users (phone_number, username) VALUES (?, ?)",
        [phoneNumber, username || "User"],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  getUser: (phoneNumber) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE phone_number = ?", [phoneNumber], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  updateUser: (phoneNumber, data) => {
    return new Promise((resolve, reject) => {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const setClause = keys.map(key => `${key} = ?`).join(", ");
      
      db.run(
        `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE phone_number = ?`,
        [...values, phoneNumber],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  },

  // Group functions
  addGroup: (groupJid, groupName, owner) => {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT OR IGNORE INTO groups (group_jid, group_name, owner) VALUES (?, ?, ?)",
        [groupJid, groupName, owner],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  getGroup: (groupJid) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM groups WHERE group_jid = ?", [groupJid], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Settings functions
  setSetting: (phoneNumber, key, value) => {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO settings (phone_number, setting_key, setting_value) VALUES (?, ?, ?)",
        [phoneNumber, key, value],
        function (err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  },

  getSetting: (phoneNumber, key) => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT setting_value FROM settings WHERE phone_number = ? AND setting_key = ?",
        [phoneNumber, key],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.setting_value : null);
        }
      );
    });
  },

  // Message log functions
  logMessage: (phoneNumber, message, messageType = "text") => {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO message_logs (phone_number, message, message_type) VALUES (?, ?, ?)",
        [phoneNumber, message, messageType],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },
};

module.exports = { db, dbHelper };
