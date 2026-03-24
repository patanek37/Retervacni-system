document.addEventListener("DOMContentLoaded", function () {

generateWorkingHours();
let calendar;

/* =========================
   TOAST NOTIFIKACE
========================= */

function showToast(message,type="success"){

const toast=document.getElementById("toast");
if(!toast) return;

toast.textContent=message;

toast.classList.remove("bg-green-500","bg-red-500");

if(type==="error"){
toast.classList.add("bg-red-500");
}else{
toast.classList.add("bg-green-500");
}

toast.classList.remove("hidden");

setTimeout(()=>{
toast.classList.add("hidden");
},3000);

}

/* =========================
   GENEROVÁNÍ PRACOVNÍCH HODIN
========================= */

function generateWorkingHours(){

const timeSelect = document.getElementById("time");
timeSelect.innerHTML="";

for(let hour=8; hour<17; hour++){

    ["00","30"].forEach(minute=>{

        const formatted =
            String(hour).padStart(2,"0") + ":" + minute;

        const option = document.createElement("option");

        option.value = formatted;
        option.textContent = formatted;

        timeSelect.appendChild(option);

    });

}

// poslední čas
const last = document.createElement("option");
last.value = "17:00";
last.textContent = "17:00";
timeSelect.appendChild(last);

}

/* =========================
   BLOKOVÁNÍ OBSAZENÝCH ČASŮ
========================= */

async function updateBlockedTimes(){

const date=document.getElementById("date").value;
if(!date) return;

const timeSelect=document.getElementById("time");

generateWorkingHours();

try{

const res=await fetch("/reservations");
const reservations=await res.json();

const takenTimes=reservations
.filter(r=>r.date===date)
.map(r=>r.time);

Array.from(timeSelect.options).forEach(option=>{

if(takenTimes.includes(option.value)){
option.disabled=true;
option.textContent=option.value+" (obsazeno)";
}

});

}catch(err){

console.error("Chyba při načítání rezervací",err);

}

}

document.getElementById("date").addEventListener("change",updateBlockedTimes);

/* =========================
   ZVÝRAZNĚNÍ SLUŽBY
========================= */

const serviceLabels=document.querySelectorAll(".service-option");

function updateServiceHighlight(){

serviceLabels.forEach(label=>{

const input=label.querySelector('input[name="service"]');

label.classList.remove("service-střih","service-vousy","service-strih-vousy");

if(input.checked){

if(input.value==="Střih") label.classList.add("service-střih");
else if(input.value==="Vousy") label.classList.add("service-vousy");
else if(input.value==="Střih + vousy") label.classList.add("service-strih-vousy");

}

});

}

updateServiceHighlight();

serviceLabels.forEach(label=>{
const input=label.querySelector('input[name="service"]');
input.addEventListener("change",updateServiceHighlight);
});

/* =========================
   FULL CALENDAR
========================= */

const calendarEl=document.getElementById("calendar");

calendar=new FullCalendar.Calendar(calendarEl,{

initialView:"timeGridWeek",
slotMinTime:"08:00:00",
slotMaxTime:"17:00:00",

height:"auto",
contentHeight:600,

slotDuration:"00:30:00",
slotLabelInterval:"00:30",
snapDuration:"00:30:00",
slotLabelFormat:{hour:"2-digit",minute:"2-digit",hour12:false},
allDaySlot:false,
locale:"cs",
timeZone:"local",

selectable:true,

headerToolbar:{
left:"prev,next today",
center:"title",
right:"timeGridDay,timeGridWeek,dayGridMonth"
},

buttonText:{
today:"Dnes",
week:"Týden",
day:"Den",
month:"Měsíc"
},

/* ===== KLIK NA KALENDÁŘ ===== */

dateClick:function(info){

if(window.isAdmin && window.adminToken){

const date = info.dateStr.split("T")[0];
const time = info.dateStr.split("T")[1].substring(0,5);

// 🔥 nejdřív zjistíme jestli už existuje blok
fetch("/availability")
.then(res => res.json())
.then(data => {

const existing = data.find(a =>
    a.date === date &&
    a.time === time &&
    a.is_available === false
);

if(existing){

// ❌ ODLOKOVÁNÍ (DELETE)
if(confirm("Odblokovat tento čas?")){

fetch("/availability/"+existing.id,{
method:"DELETE",
headers:{
"x-admin-token":window.adminToken
}
}).then(()=>{
calendar.refetchEvents();
updateBlockedTimes();
});

}

}else{

// 🔒 BLOKOVÁNÍ
if(confirm("Zablokovat tento čas?")){

fetch("/availability",{
method:"POST",
headers:{
"Content-Type":"application/json",
"x-admin-token":window.adminToken
},
body:JSON.stringify({
date:date,
time:time,
is_available:false
})
}).then(()=>{
calendar.refetchEvents();
updateBlockedTimes();
});

}

}

});

return;
}
const clickedDate = info.date;

// datum
const year = clickedDate.getFullYear();
const month = String(clickedDate.getMonth()+1).padStart(2,"0");
const day = String(clickedDate.getDate()).padStart(2,"0");

// čas (BEZ POSUNU)
let hours = clickedDate.getHours();
let minutes = clickedDate.getMinutes();

// ZAOKROUHLENÍ NA 30 MIN
if(minutes < 30){
    minutes = "00";
}else{
    minutes = "30";
}

const formattedTime =
    String(hours).padStart(2,"0") + ":" + minutes;

// nastav do formuláře
document.getElementById("date").value = `${year}-${month}-${day}`;

updateBlockedTimes();

setTimeout(()=>{
    const select = document.getElementById("time");

    // fallback – když by tam náhodou nebylo
    if(select.querySelector(`option[value="${formattedTime}"]`)){
        select.value = formattedTime;
    } else {
        console.log("Čas nenalezen:", formattedTime);
    }

},100);

// scroll
document.getElementById("bookingForm").scrollIntoView({
    behavior:"smooth"
});

},

events:async function(fetchInfo,successCallback){

try{

const res=await fetch("/reservations");
const data=await res.json();
const availabilityRes = await fetch("/availability");
const availability = await availabilityRes.json();

const events=data.map(r=>{

if(!r.date||!r.time) return null;

const [year,month,day]=r.date.split("-").map(Number);
const [hour,minute]=r.time.split(":").map(Number);

const start=new Date(year,month-1,day,hour,minute);
const end=new Date(start.getTime()+(r.duration||60)*60000);

let className="";

if(r.service==="Střih") className="střih";
else if(r.service==="Vousy") className="vousy";
else if(r.service==="Střih + vousy") className="strih-vousy";

return{
id:r.id,
title:`${r.name} (${r.service})`,
start:start.toISOString(),
end:end.toISOString(),
className:className
};

}).filter(e=>e!==null);

const blockedEvents = availability
.filter(a => a.is_available === false)
.map(a => {

const [year,month,day]=a.date.split("-").map(Number);
const [hour,minute]=a.time.split(":").map(Number);

const start=new Date(year,month-1,day,hour,minute);
const end=new Date(start.getTime()+30*60000);

return{
id:a.id,
title:"ZAVŘENO",
start:start.toISOString(),
end:end.toISOString(),
className:"blocked"
};

});

successCallback([...events, ...blockedEvents]);

}catch(err){

console.error("Chyba při načítání kalendáře",err);

}

},

eventClick:async function(info){

if(info.event.title === "ZAVŘENO"){

if(window.isAdmin && window.adminToken){

if(confirm("Odblokovat tento čas?")){

fetch("/availability/"+info.event.id,{
method:"DELETE",
headers:{
"x-admin-token":window.adminToken
}
}).then(()=>{
calendar.refetchEvents();
updateBlockedTimes();
});

}

}

return;
}

if(window.isAdmin && window.adminToken){

if(confirm("Smazat rezervaci?")){

await fetch("/reservations/"+info.event.id,{
method:"DELETE",
headers:{
"x-admin-token":window.adminToken
}
});

calendar.refetchEvents();
loadAdminReservations();

}

}else{

alert(`Rezervace: ${info.event.title}\nČas: ${info.event.start.toLocaleString()}`);

}

}

});

calendar.render();

/* =========================
   REZERVAČNÍ FORMULÁŘ
========================= */

const form=document.getElementById("bookingForm");

form.addEventListener("submit",async function(e){

e.preventDefault();

const service=document.querySelector('input[name="service"]:checked').value;

let duration=60;

if(service==="Vousy") duration=45;
if(service==="Střih + vousy") duration=90;

const reservation={
name:document.getElementById("name").value,
service:service,
date:document.getElementById("date").value,
time:document.getElementById("time").value,
duration:duration
};

try{

const res=await fetch("/reservations",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(reservation)
});

if(res.ok){

calendar.refetchEvents();
form.reset();
updateServiceHighlight();

showToast("Rezervace úspěšně vytvořena");

}else{

const data=await res.json();
alert(data.message||data.error||"Chyba při rezervaci.");

}

}catch(err){

console.error("Chyba při odesílání rezervace",err);

}

});

/* =========================
   ADMIN PANEL
========================= */

async function loadAdminReservations(filterDate=null){

const res=await fetch("/reservations");
let data=await res.json();

if(filterDate){
data=data.filter(r=>r.date===filterDate);
}

const table=document.getElementById("admin-reservations");
table.innerHTML="";

data.forEach(r=>{

const row=document.createElement("tr");

row.innerHTML=`
<td class="border p-2">${r.date}</td>
<td class="border p-2">${r.time}</td>
<td class="border p-2">${r.name}</td>
<td class="border p-2">${r.service}</td>
<td class="border p-2 flex gap-2">
<button class="bg-yellow-500 text-white px-2 py-1 rounded edit-btn" data-id="${r.id}">Edit</button>
<button class="bg-red-500 text-white px-2 py-1 rounded delete-btn" data-id="${r.id}">Smazat</button>
</td>
`;

table.appendChild(row);

});

/* MAZÁNÍ */

document.querySelectorAll(".delete-btn").forEach(btn=>{

btn.addEventListener("click",async function(){

if(!confirm("Smazat rezervaci?")) return;

const id=this.dataset.id;

await fetch("/reservations/"+id,{
method:"DELETE",
headers:{
"x-admin-token":window.adminToken
}
});

loadAdminReservations();
calendar.refetchEvents();

});

});

/* EDITACE */

document.querySelectorAll(".edit-btn").forEach(btn=>{

btn.addEventListener("click",async function(){

const id=this.dataset.id;

const name=prompt("Jméno zákazníka:");
const service=prompt("Služba:");
const date=prompt("Datum YYYY-MM-DD:");
const time=prompt("Čas HH:MM:");

if(!name||!service||!date||!time) return;

await fetch("/reservations/"+id,{
method:"PUT",
headers:{
"Content-Type":"application/json",
"x-admin-token":window.adminToken
},
body:JSON.stringify({name,service,date,time})
});

loadAdminReservations();
calendar.refetchEvents();

});

});

}

/* =========================
   FILTRY ADMINA
========================= */

document.getElementById("admin-filter-date").addEventListener("change",function(){
loadAdminReservations(this.value);
});

document.getElementById("admin-today").addEventListener("click",function(){

const today=new Date().toISOString().split("T")[0];
loadAdminReservations(today);

});

document.getElementById("admin-show-all").addEventListener("click",function(){
loadAdminReservations();
});

/* =========================
   ADMIN LOGIN
========================= */

const adminButton=document.getElementById("admin-login-button");
const adminModal=document.getElementById("admin-modal");
const adminCancel=document.getElementById("admin-login-cancel");
const adminSubmit=document.getElementById("admin-login-submit");
const adminError=document.getElementById("admin-login-error");

adminButton.addEventListener("click",()=>{
adminModal.classList.remove("hidden");
});

adminCancel.addEventListener("click",()=>{
adminModal.classList.add("hidden");
adminError.classList.add("hidden");
});

adminSubmit.addEventListener("click",async function(){

const username=document.getElementById("admin-username").value;
const password=document.getElementById("admin-password").value;

try{

const res=await fetch("/admin-login",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({username,password})
});

if(res.ok){

const data=await res.json();

window.isAdmin=true;
window.adminToken=data.token;

document.getElementById("admin-panel").classList.remove("hidden");

loadAdminReservations();

adminModal.classList.add("hidden");

showToast("Admin přihlášen");

}else{

adminError.classList.remove("hidden");

}

}catch(err){

console.error("Chyba při admin loginu",err);

}

});

});
/* =========================
   CLIENT LOCK
========================= */

const CLIENT_PASSWORD = "6969"; // ← změň!

const lock = document.getElementById("client-lock");
const input = document.getElementById("client-password");
const btn = document.getElementById("client-login-btn");
const error = document.getElementById("client-error");

btn.addEventListener("click", () => {

    if(input.value === CLIENT_PASSWORD){

        lock.style.display = "none";
        sessionStorage.setItem("client_access", "true");

    } else {
        error.classList.remove("hidden");
    }

});

// pokud už byl přihlášen
if(sessionStorage.getItem("client_access") === "true"){
    lock.style.display = "none";
}