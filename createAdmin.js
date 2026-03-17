const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const db = new sqlite3.Database("./database.db");

const username = "tomas";         // zadej jméno admina
const password = "tomino.12345"; // nové bezpečné heslo

bcrypt.hash(password, 10, (err, hash) => {
    if(err) throw err;
    db.run("INSERT INTO admins(username, password) VALUES(?,?)", [username, hash], () => {
        console.log("Admin vytvořen!");
        db.close();
    });
});