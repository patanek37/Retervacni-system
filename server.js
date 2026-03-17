const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// --- DB připojení ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- vytvoření tabulek ---
async function initDB(){
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reservations (
            id SERIAL PRIMARY KEY,
            name TEXT,
            service TEXT,
            date TEXT,
            time TEXT,
            duration INTEGER DEFAULT 60
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT
        )
    `);
}

initDB();

// --- admin tokeny ---
const adminTokens = {};

// --- ADMIN LOGIN ---
app.post("/admin-login", async (req, res) => {
    try{
        const { username, password } = req.body;

        const result = await pool.query(
            "SELECT * FROM admins WHERE username = $1",
            [username]
        );

        if(result.rows.length === 0){
            return res.status(401).json({ error: "Špatné údaje" });
        }

        const user = result.rows[0];

        const match = await bcrypt.compare(password, user.password);

        if(match){
            const token = crypto.randomBytes(16).toString("hex");
            adminTokens[token] = user.id;
            res.json({ token });
        } else {
            res.status(401).json({ error: "Špatné údaje" });
        }

    }catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- GET rezervace ---
app.get("/reservations", async (req, res) => {
    try{
        const result = await pool.query("SELECT * FROM reservations");
        res.json(result.rows);
    }catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- POST rezervace ---
app.post("/reservations", async (req, res) => {
    try{
        const { name, service, date, time, duration } = req.body;

        // kontrola duplicity
        const check = await pool.query(
            "SELECT * FROM reservations WHERE date=$1 AND time=$2",
            [date, time]
        );

        if(check.rows.length > 0){
            return res.status(400).json({ message: "Tento čas je obsazen" });
        }

        const result = await pool.query(
            "INSERT INTO reservations(name, service, date, time, duration) VALUES($1,$2,$3,$4,$5) RETURNING id",
            [name, service, date, time, duration]
        );

        res.json({ id: result.rows[0].id });

    }catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE ---
app.delete("/reservations/:id", async (req, res) => {
    try{
        const token = req.headers["x-admin-token"];

        if(!token || !adminTokens[token]){
            return res.status(401).json({ error: "Pouze admin" });
        }

        await pool.query(
            "DELETE FROM reservations WHERE id=$1",
            [req.params.id]
        );

        res.json({ deleted: true });

    }catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- EDIT ---
app.put("/reservations/:id", async (req, res) => {
    try{
        const token = req.headers["x-admin-token"];

        if(!token || !adminTokens[token]){
            return res.status(401).json({ error: "Pouze admin" });
        }

        const { name, service, date, time } = req.body;

        await pool.query(
            "UPDATE reservations SET name=$1, service=$2, date=$3, time=$4 WHERE id=$5",
            [name, service, date, time, req.params.id]
        );

        res.json({ updated: true });

    }catch(err){
        res.status(500).json({ error: err.message });
    }
});

// --- PORT ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server běží na portu " + PORT);
});