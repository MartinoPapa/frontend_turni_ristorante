// ==========================================
// GESTIONE FRONTEND: lavoratori + ruoli + turni
// ==========================================

let workers = [];
let roles = [];
let worker_index = 0;
let role_index = 0;
let psw = "";
let editingRoleIndex = -1;

// URL backend (aggiorna se locale)
const BACKEND_URL = "https://backend-turni-ristorante.onrender.com";

// =================== FUNZIONI FETCH ===================
async function storeData(key, value) {
  try {
    const response = await fetch(`${BACKEND_URL}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    console.log("Dati salvati:", data);
    return data;
  } catch (err) {
    console.error("Errore storeData:", err);
    alert("Errore di connessione al server.");
    localStorage.setItem(key, JSON.stringify(value));
    return { local: true };
  }
}

async function loadData(key) {
  try {
    const response = await fetch(`${BACKEND_URL}/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data.value;
  } catch (err) {
    console.warn("Errore loadData:", err);
  }
  return null;
}


// =================== CLASSE LAVORATORE ===================
class Lavoratore {
  constructor(nome, ruoli, disponibilita, maxOre) {
    this.nome = nome;
    this.ruoli = ruoli;
    this.disponibilita = disponibilita;
    this.maxOre = maxOre;
    this.index = worker_index++;
    this.article = null;
  }

  generaCard() {
    const article = document.createElement("article");
    article.classList.add("card");
    this.article = article;

    article.innerHTML = `
      <h4>${this.nome}</h4>
      <h6>${this.ruoli.join(", ")}</h6>
      <h5>Disponibilità</h5>
      <table class="schedule-table">
        <thead>
          <tr><th></th><th>Pranzo</th><th>Cena</th></tr>
        </thead>
        <tbody>
          ${Object.entries(this.disponibilita)
        .map(([giorno, disp]) => `
              <tr>
                <td>${giorno}</td>
                <td class="${disp.pranzo ? "yes" : "no"}">${disp.pranzo ? "Sì" : "No"}</td>
                <td class="${disp.cena ? "yes" : "no"}">${disp.cena ? "Sì" : "No"}</td>
              </tr>`).join("")}
        </tbody>
      </table>
      <button onclick="eliminaLavoratore(${this.index})">Elimina</button>
      <div class="meta">max ${this.maxOre} ore/settimana</div>
    `;
    return article;
  }

  serialize() {
    return {
      nome: this.nome,
      ruoli: this.ruoli,
      disponibilita: this.disponibilita,
      maxOre: this.maxOre
    };
  }
}

// =================== CLASSE RUOLO ===================
class Ruolo {
  constructor(nome, shifts = []) {
    this.nome = nome;
    this.shifts = shifts;
    this.index = role_index++;
    this.article = null;
  }

  generaCard() {
    const article = document.createElement("div");
    article.classList.add("ruolo");
    this.article = article;

    const shiftRows = this.shifts.map(s => `
      <tr>
        <td>${s.giorno}</td>
        <td>${s.turno}</td>
        <td>${s.ore}</td>
        <td>${s.persone}</td>
      </tr>
    `).join("");

    article.innerHTML = `
      <h4>${this.nome}</h4>
      <table class="shift-table">
        <thead>
          <tr><th>Giorno</th><th>Turno</th><th># Ore</th><th># Persone</th></tr>
        </thead>
        <tbody>${shiftRows}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button onclick="editRole(${this.index})">Modifica</button>
        <button onclick="eliminaRuolo(${this.index})">Elimina</button>
      </div>
    `;
    return article;
  }

  serialize() {
    return { nome: this.nome, shifts: this.shifts };
  }
}

// =================== FUNZIONI PERSONALE ===================
function openworker() { document.getElementById("addworkerpage").style.display = "flex"; }
function closeworker() { document.getElementById("addworkerpage").style.display = "none"; }

function creaLavoratoreDaInput() {
  const nome = document.getElementById("nome").value.trim();
  const ruoli = document.getElementById("ruolo").value.split(",").map(r => r.trim()).filter(r => r);
  const maxOre = parseInt(document.querySelector('#maxOreInput').value, 10) || 0;
  const rows = document.querySelectorAll("#scheduleTable tbody tr");

  const disponibilita = {};
  rows.forEach(row => {
    const giorno = row.cells[0].textContent.trim();
    disponibilita[giorno] = {
      pranzo: row.cells[1].querySelector("input").checked,
      cena: row.cells[2].querySelector("input").checked
    };
  });

  return new Lavoratore(nome, ruoli, disponibilita, maxOre);
}

function aggiungiEChiudi() {
  const lavoratore = creaLavoratoreDaInput();
  if (!lavoratore.nome) return alert("Inserisci un nome.");
  workers.push(lavoratore);
  document.getElementById("track").appendChild(lavoratore.generaCard());
  closeworker();
  clearAddWorkerForm();
  storeAll();
}

function eliminaLavoratore(i) {
  workers = workers.filter(w => w.index !== i);
  renderWorkers();
  storeAll();
}

function renderWorkers() {
  const track = document.getElementById("track");
  track.innerHTML = "";
  workers.forEach(w => track.appendChild(w.generaCard()));
}

function clearAddWorkerForm() {
  document.getElementById("nome").value = "";
  document.getElementById("ruolo").value = "";
  document.querySelector('#maxOreInput').value = "";
  document.querySelectorAll("#scheduleTable tbody input").forEach(i => i.checked = false);
}

// =================== FUNZIONI RUOLI ===================
function openrole() {
  editingRoleIndex = -1;
  document.getElementById("addrolepage").style.display = "flex";
  clearAddRoleForm();
  addShiftRow();
}
function closerole() { 
  document.getElementById("addrolepage").style.display = "none"; 
  editingRoleIndex = -1;

}

function addShiftRow(prefill = null) {
  const container = document.getElementById("roleShiftsContainer");
  const row = document.createElement("div");
  row.classList.add("shift-row");
  row.innerHTML = `
    <select class="day-select">
      <option>Lunedì</option><option>Martedì</option><option>Mercoledì</option>
      <option>Giovedì</option><option>Venerdì</option><option>Sabato</option><option>Domenica</option>
    </select>
    <select class="turno-select"><option>Pranzo</option><option>Cena</option></select>
    <input class="small-input ore-input" type="number" min="0" step="1" placeholder="# ore">
    <input class="small-input persone-input" type="number" min="1" step="1" placeholder="# persone">
    <button class="delete-shift">X</button>
  `;
  if (prefill) {
    row.querySelector(".day-select").value = prefill.giorno;
    row.querySelector(".turno-select").value = prefill.turno;
    row.querySelector(".ore-input").value = prefill.ore;
    row.querySelector(".persone-input").value = prefill.persone;
  }
  row.querySelector(".delete-shift").addEventListener("click", () => container.removeChild(row));
  container.appendChild(row);
}

function clearAddRoleForm() {
  document.getElementById("roleName").value = "";
  document.getElementById("roleShiftsContainer").innerHTML = "";
}

function createRoleFromInput() {
  const nome = document.getElementById("roleName").value.trim();
  const shifts = [...document.querySelectorAll(".shift-row")].map(row => ({
    giorno: row.querySelector(".day-select").value,
    turno: row.querySelector(".turno-select").value,
    ore: parseInt(row.querySelector(".ore-input").value, 10) || 0,
    persone: parseInt(row.querySelector(".persone-input").value, 10) || 1
  }));
  return new Ruolo(nome, shifts);
}

function aggiungiRuoloEChiudi() {
  const ruolo = createRoleFromInput();
  if (!ruolo.nome || ruolo.shifts.length === 0)
    return alert("Completa nome e almeno un turno.");
  if (editingRoleIndex !== -1) {
    roles = roles.filter(r => r.index !== editingRoleIndex);
  }
  editingRoleIndex = -1;
  // cambiare metodo quando si clicca su modifica indice edit = -1 o indice ruolo
  roles.push(ruolo);
  renderRoles();
  closerole();
  storeAll();
}

function editRole(i) {
  const ruolo = roles.find(r => r.index === i);
  if (!ruolo) return;
  editingRoleIndex = i;
  document.getElementById("addrolepage").style.display = "flex";
  document.getElementById("roleName").value = ruolo.nome;
  const cont = document.getElementById("roleShiftsContainer");
  cont.innerHTML = "";
  ruolo.shifts.forEach(s => addShiftRow(s));
}

function eliminaRuolo(i) {
  roles = roles.filter(r => r.index !== i);
  renderRoles();
  storeAll();
}

function renderRoles() {
  const wrapper = document.getElementById("ruoliWrapper");
  wrapper.innerHTML = "";
  roles.forEach(r => wrapper.appendChild(r.generaCard()));
}

// =================== SALVATAGGIO / CARICAMENTO ===================
function storeAll() {
  if (!psw) return alert("Inserisci un codice prima di salvare.");
  const value = {
    workers: workers.map(w => w.serialize()),
    roles: roles.map(r => r.serialize())
  };
  storeData(psw, value);
}

function loadAll() {
  loadData(psw).then(data => {
    if (!data) throw new Error("Il codice inserito non corrisponde a nessun ristorante.");
    workers = (data.workers || []).map(
      w => new Lavoratore(w.nome, w.ruoli, w.disponibilita, w.maxOre)
    );
    roles = (data.roles || []).map(r => new Ruolo(r.nome, r.shifts));
    worker_index = workers.length;
    role_index = roles.length;
    renderWorkers();
    renderRoles();
    console.log("Login effettuato con codice:", psw);
    document.getElementById("loginpage").style.display = "none";
  }).catch(err => {
    alert(err.message);
    return false;
  });
}

function salvaDati() {
  storeAll();
}

function caricaDati() {
  loadAll();
}

function login() {
  psw = document.getElementById("codice").value.trim();
  loadAll();
}