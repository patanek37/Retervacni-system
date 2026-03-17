const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// --- databáze ---
const db = new sqlite3.Database("./database.db");

// Vytvoření tabulek, pokud neexistují
db.run(`
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    service TEXT,
    date TEXT,
    time TEXT,
    duration INTEGER DEFAULT 60
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
`);

// --- Paměť pro aktivní admin tokeny ---
const adminTokens = {};

// --- ADMIN LOGIN ---
app.post("/admin-login", (req, res) => {
    const { username, password } = req.body;

    if(typeof username !== "string" || username.trim().length < 3){
        return res.status(400).json({ error: "Uživatelské jméno je příliš krátké" });
    }
    if(typeof password !== "string" || password.length < 6){
        return res.status(400).json({ error: "Heslo musí mít alespoň 6 znaků" });
    }

    db.get("SELECT * FROM admins WHERE username = ?", [username.trim()], (err, row) => {
        if(err) return res.status(500).json({ error: err.message });
        if(!row) return res.status(401).json({ error: "Neplatné přihlašovací údaje" });

        bcrypt.compare(password, row.password, (err, result) => {
            if(err) return res.status(500).json({ error: err.message });
            if(result) {
                const token = crypto.randomBytes(16).toString("hex");
                adminTokens[token] = row.id;
                res.json({ success: true, token });
            } else {
                res.status(401).json({ error: "Neplatné přihlašovací údaje" });
            }
        });
    });
});

// --- GET – všechny rezervace ---
app.get("/reservations", (req, res) => {
    db.all("SELECT * FROM reservations", [], (err, rows) => {
        if(err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- POST – přidání rezervace ---
app.post("/reservations", (req, res) => {
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
    const now = new Date();
    if(reservationDate < now){
        return res.status(400).json({ error: "Nemůžete rezervovat čas, který již proběhl." });
    }

    db.get("SELECT * FROM reservations WHERE date = ? AND time = ?", [date, time], (err, row) => {
        if(err) return res.status(500).json({ error: err.message });
        if(row) return res.status(400).json({ message: "Tento čas je již obsazen." });

        db.run(
            "INSERT INTO reservations(name, service, date, time, duration) VALUES(?,?,?,?,?)",
            [name.trim(), service, date, time, dur],
            function(err){
                if(err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    });
});

// --- DELETE – smazání rezervace (jen admin s tokenem) ---
app.delete("/reservations/:id", (req, res) => {
    const token = req.headers["x-admin-token"];
    if(!token || !adminTokens[token]){
        return res.status(401).json({ error: "Neautorizovaný přístup – pouze admin" });
    }

    const id = req.params.id;
    db.run("DELETE FROM reservations WHERE id = ?", [id], function(err){
        if(err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// edit rezervací//
app.put("/reservations/:id",(req,res)=>{

const {name,service,date,time}=req.body;

db.run(
"UPDATE reservations SET name=?, service=?, date=?, time=? WHERE id=?",
[name,service,date,time,req.params.id],
function(err){

if(err) return res.status(500).json({error:err.message});

res.json({updated:true});

});

});

// --- Spuštění serveru ---
app.listen(3000, () => {
    console.log("Server běží na http://localhost:3000");
});