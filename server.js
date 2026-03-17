const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// --- databáze ---
const db = new Database("database.db");

// --- vytvoření tabulek ---
db.prepare(`
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    service TEXT,
    date TEXT,
    time TEXT,
    duration INTEGER DEFAULT 60
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
`).run();

// --- admin tokeny ---
const adminTokens = {};

// --- ADMIN LOGIN ---
app.post("/admin-login", (req, res) => {
    try {
        const { username, password } = req.body;

        if(typeof username !== "string" || username.trim().length < 3){
            return res.status(400).json({ error: "Uživatelské jméno je příliš krátké" });
        }

        if(typeof password !== "string" || password.length < 6){
            return res.status(400).json({ error: "Heslo musí mít alespoň 6 znaků" });
        }

        const row = db.prepare("SELECT * FROM admins WHERE username = ?").get(username.trim());

        if(!row){
            return res.status(401).json({ error: "Neplatné přihlašovací údaje" });
        }

        const match = bcrypt.compareSync(password, row.password);

        if(match){
            const token = crypto.randomBytes(16).toString("hex");
            adminTokens[token] = row.id;
            return res.json({ success: true, token });
        } else {
            return res.status(401).json({ error: "Neplatné přihlašovací údaje" });
        }

    } catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- GET rezervace ---
app.get("/reservations", (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM reservations").all();
        res.json(rows);
    } catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- POST rezervace ---
app.post("/reservations", (req, res) => {
    try {
        const { name, service, date, time, duration } = req.body;

        if(typeof name !== "string" || name.trim().length < 2){
            return res.status(400).json({ error: "Jméno je příliš krátké" });
        }

        const allowedServices = ["Střih", "Vousy", "Střih + vousy"];
        if(!allowedServices.includes(service)){
            return res.status(400).json({ error: "Neplatná služba" });
        }

        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
            return res.status(400).json({ error: "Neplatný formát data" });
        }

        if(!/^\d{2}:\d{2}$/.test(time)){
            return res.status(400).json({ error: "Neplatný formát času" });
        }

        const dur = parseInt(duration);
        if(isNaN(dur) || dur < 15 || dur > 180){
            return res.status(400).json({ error: "Neplatná délka služby" });
        }

        const [year, month, day] = date.split("-").map(Number);
        const [hour, minute] = time.split(":").map(Number);
        const reservationDate = new Date(year, month - 1, day, hour, minute);

        if(reservationDate < new Date()){
            return res.status(400).json({ error: "Nelze rezervovat minulý čas" });
        }

        const existing = db.prepare(
            "SELECT * FROM reservations WHERE date = ? AND time = ?"
        ).get(date, time);

        if(existing){
            return res.status(400).json({ message: "Tento čas je již obsazen." });
        }

        const result = db.prepare(
            "INSERT INTO reservations(name, service, date, time, duration) VALUES(?,?,?,?,?)"
        ).run(name.trim(), service, date, time, dur);

        res.json({ id: result.lastInsertRowid });

    } catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE ---
app.delete("/reservations/:id", (req, res) => {
    try {
        const token = req.headers["x-admin-token"];

        if(!token || !adminTokens[token]){
            return res.status(401).json({ error: "Pouze admin" });
        }

        db.prepare("DELETE FROM reservations WHERE id = ?").run(req.params.id);

        res.json({ deleted: true });

    } catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- EDIT ---
app.put("/reservations/:id", (req, res) => {
    try {
        const token = req.headers["x-admin-token"];

        if(!token || !adminTokens[token]){
            return res.status(401).json({ error: "Pouze admin" });
        }

        const { name, service, date, time } = req.body;

        db.prepare(
            "UPDATE reservations SET name=?, service=?, date=?, time=? WHERE id=?"
        ).run(name, service, date, time, req.params.id);

        res.json({ updated: true });

    } catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- PORT (DŮLEŽITÉ PRO RENDER) ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server běží na portu " + PORT);
});