// ==========================================
// GESTIONE FRONTEND: lavoratori + ruoli + turni
// ==========================================

let workers = [];
let roles = [];
// DEFAULT TURN TYPES
let turnTypes = [
    { name: "Pranzo", start: "11:00", end: "15:00" },
    { name: "Cena", start: "18:00", end: "23:00" }
];

let worker_index = 0;
let role_index = 0;
let psw = "";
let editingRoleIndex = -1;
let editingWorkerIndex = -1;

// URL backend
const BACKEND_URL = "https://backend-turni-ristorante.onrender.com";

// =================== HELPER TIME FUNCTIONS ===================
function calculateHours(start, end) {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(":").map(Number);
    const [h2, m2] = end.split(":").map(Number);
    let diff = (h2 + m2 / 60) - (h1 + m1 / 60);
    if (diff < 0) diff += 24; 
    return parseFloat(diff.toFixed(2));
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

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

// =================== GESTIONE TIPI DI TURNO ===================
function openTurnTypes() {
    document.getElementById("turntypespage").style.display = "flex";
    renderTurnTypesEditor();
}

function closeTurnTypes() {
    document.getElementById("turntypespage").style.display = "none";
}

function renderTurnTypesEditor() {
    const container = document.getElementById("turnTypesList");
    container.innerHTML = "";
    turnTypes.forEach((t, index) => {
        const row = document.createElement("div");
        row.className = "turn-type-row";
        // REMOVED INLINE STYLE style="width:120px!important", ADDED CLASS input-turn-name
        row.innerHTML = `
            <input type="text" value="${t.name}" class="small-input turn-name input-turn-name" placeholder="Nome">
            <input type="time" value="${t.start}" class="time-input turn-start">
            <span>a</span>
            <input type="time" value="${t.end}" class="time-input turn-end">
            <button class="delete-shift" onclick="removeTurnType(${index})">X</button>
        `;
        container.appendChild(row);
    });
}

function syncTurnTypesFromDOM() {
    const rows = document.querySelectorAll(".turn-type-row");
    return Array.from(rows).map(row => ({
        name: capitalize(row.querySelector(".turn-name").value.trim()),
        start: row.querySelector(".turn-start").value,
        end: row.querySelector(".turn-end").value
    }));
}

function addTurnTypeRow() {
    turnTypes = syncTurnTypesFromDOM(); 
    turnTypes.push({ name: "", start: "12:00", end: "15:00" });
    renderTurnTypesEditor();
}

function removeTurnType(index) {
    turnTypes = syncTurnTypesFromDOM();
    turnTypes.splice(index, 1);
    renderTurnTypesEditor();
}

function saveTurnTypesAndClose() {
    const rows = document.querySelectorAll(".turn-type-row");
    const newTypes = [];
    let valid = true;

    rows.forEach(row => {
        const nameRaw = row.querySelector(".turn-name").value.trim();
        const start = row.querySelector(".turn-start").value;
        const end = row.querySelector(".turn-end").value;
        if(!nameRaw || !start || !end) valid = false;
        newTypes.push({ name: capitalize(nameRaw), start, end });
    });

    if(!valid) return alert("Inserisci nome, inizio e fine per tutti i turni.");

    const limit = Math.min(turnTypes.length, newTypes.length);

    for (let i = 0; i < limit; i++) {
        const oldName = turnTypes[i].name;
        const newName = newTypes[i].name;

        if (oldName && newName && oldName !== newName) {
            console.log(`Renaming turn ${oldName} to ${newName}`);
            
            workers.forEach(w => {
                if (w.disponibilita) {
                    for (const day in w.disponibilita) {
                        if (w.disponibilita[day][oldName] !== undefined) {
                            w.disponibilita[day][newName] = w.disponibilita[day][oldName];
                            delete w.disponibilita[day][oldName];
                        }
                    }
                }
            });

            roles.forEach(r => {
                r.shifts.forEach(s => {
                    if (s.turno === oldName) {
                        s.turno = newName;
                    }
                });
            });
        }
    }

    turnTypes = newTypes;
    closeTurnTypes();
    
    renderWorkers(); 
    renderRoles();
    storeAll();
}

function getTurnHours(turnName) {
    const t = turnTypes.find(x => x.name === turnName);
    if (!t) return 0;
    return calculateHours(t.start, t.end);
}

// =================== CLASSI ===================
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

    const ths = turnTypes.map(t => `<th>${t.name}</th>`).join("");
    
    const tableRows = Object.entries(this.disponibilita).map(([giorno, disp]) => {
        const tds = turnTypes.map(t => {
            const isAvail = disp[t.name] === true;
            return `<td class="${isAvail ? "yes" : "no"}">${isAvail ? "Sì" : "No"}</td>`;
        }).join("");
        return `<tr><td>${giorno}</td>${tds}</tr>`;
    }).join("");

    article.innerHTML = `
      <h4>${this.nome}</h4>
      <h6>${this.ruoli.join(", ")}</h6>
      <h5>Disponibilità</h5>
      <div style="overflow-x:auto; width:100%">
        <table class="schedule-table" style="font-size:0.8em">
            <thead><tr><th></th>${ths}</tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
        <button onclick="editWorker(${this.index})" class="btnAddRole">Modifica</button>
        <button onclick="eliminaLavoratore(${this.index})" class="btnAddRole">Elimina</button>
      </div>
      <div class="meta">max ${this.maxOre} ore/settimana</div>
    `;
    return article;
  }

  serialize() {
    return { nome: this.nome, ruoli: this.ruoli, disponibilita: this.disponibilita, maxOre: this.maxOre };
  }
}

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
    
    const shiftRows = this.shifts.map(s => {
        const hours = getTurnHours(s.turno);
        return `<tr><td>${s.giorno}</td><td>${s.turno}</td><td>${hours}h</td><td>${s.persone}</td></tr>`;
    }).join("");
    
    article.innerHTML = `
      <h4>${this.nome}</h4>
      <table class="shift-table">
        <thead><tr><th>Giorno</th><th>Turno</th><th>Durata</th><th># Persone</th></tr></thead>
        <tbody>${shiftRows}</tbody>
      </table>
      <div style="display:flex;gap:6px;justify-content:center; flex-wrap:wrap;" class="3trebottoni">
        <button onclick="editRole(${this.index})">Modifica</button>
        <button onclick="duplicateRole(${this.index})" class="btn-duplicate">Duplica</button>
        <button onclick="eliminaRuolo(${this.index})">Elimina</button>
      </div>`;
    return article;
  }

  serialize() {
    return { nome: this.nome, shifts: this.shifts };
  }
}

// =================== CUSTOM DROPDOWN RUOLI ===================
function renderCustomRuoli(selectedArr = []) {
  const container = document.getElementById("ruoloSelectContainer");
  container.innerHTML = `
    <div class="custom-multiselect">
      <div id="ruoloDisplay" class="select-display">Seleziona ruoli…</div>
      <div id="ruoloOptions" class="select-options" role="listbox"></div>
    </div>`;
  const options = document.getElementById("ruoloOptions");

  roles.forEach(r => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = r.nome;
    checkbox.checked = selectedArr.includes(r.nome);
    checkbox.addEventListener("change", updateRuoloDisplay);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(r.nome));
    options.appendChild(label);
  });
  updateRuoloDisplay();
  initCustomRuoloDropdown();
}

function updateRuoloDisplay() {
  const display = document.getElementById("ruoloDisplay");
  const checked = [...document.querySelectorAll("#ruoloOptions input:checked")].map(i => i.value);
  if (checked.length === 0) {
    display.textContent = "Seleziona ruoli…";
    display.classList.add("placeholder");
  } else {
    display.textContent = checked.join(", ");
    display.classList.remove("placeholder");
  }
}

function initCustomRuoloDropdown() {
  const display = document.getElementById("ruoloDisplay");
  const options = document.getElementById("ruoloOptions");
  const page = document.getElementById("addworkerpage");
  let isOpen = false;

  page.addEventListener("click", () => { isOpen = false; options.style.display = "none"; });
  display.addEventListener("click", (e) => { e.stopPropagation(); isOpen = !isOpen; options.style.display = isOpen ? "block" : "none"; });
  options.addEventListener("click", (e) => e.stopPropagation());
}

function getSelectedRuoli() {
  return [...document.querySelectorAll("#ruoloOptions input:checked")].map(i => i.value);
}

// =================== FUNZIONI PERSONALE ===================
const GIORNI_SETTIMANA = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function renderAvailabilityTable(currentData = {}) {
    const thead = document.querySelector("#scheduleTable thead");
    const tbody = document.querySelector("#scheduleTable tbody");
    
    let headerHTML = "<tr><th></th>";
    turnTypes.forEach(t => {
        // Changed inline style to class header-subtitle
        headerHTML += `<th>${t.name}<br><span class="header-subtitle">${t.start}-${t.end}</span></th>`;
    });
    headerHTML += "</tr>";
    thead.innerHTML = headerHTML;

    tbody.innerHTML = "";
    GIORNI_SETTIMANA.forEach(giorno => {
        const tr = document.createElement("tr");
        let tdHTML = `<td>${giorno}</td>`;
        turnTypes.forEach(t => {
            const isChecked = currentData[giorno] && currentData[giorno][t.name] === true;
            tdHTML += `<td><input type="checkbox" data-day="${giorno}" data-turn="${t.name}" ${isChecked ? "checked" : ""}></td>`;
        });
        tr.innerHTML = tdHTML;
        tbody.appendChild(tr);
    });
}

function openworker() {
  editingWorkerIndex = -1;
  document.getElementById("addworkerpage").style.display = "flex";
  renderCustomRuoli();
  renderAvailabilityTable({});
}

function closeworker() {
  document.getElementById("addworkerpage").style.display = "none";
  editingWorkerIndex = -1;
}

function creaLavoratoreDaInput() {
  const nome = document.getElementById("nome").value.trim();
  const ruoli = getSelectedRuoli();
  const maxOre = parseInt(document.querySelector('#maxOreInput').value, 10) || 0;
  
  const disponibilita = {};
  GIORNI_SETTIMANA.forEach(g => disponibilita[g] = {});

  const checkboxes = document.querySelectorAll("#scheduleTable tbody input[type='checkbox']");
  checkboxes.forEach(chk => {
      const d = chk.getAttribute("data-day");
      const t = chk.getAttribute("data-turn");
      disponibilita[d][t] = chk.checked;
  });

  return new Lavoratore(nome, ruoli, disponibilita, maxOre);
}

function aggiungiEChiudi() {
  const lavoratore = creaLavoratoreDaInput();
  if (!lavoratore.nome) return alert("Per favore inserire un nome.");

  const nomeEsiste = workers.some(w => w.nome.toLowerCase() === lavoratore.nome.toLowerCase() && w.index !== editingWorkerIndex);
  if (nomeEsiste) return alert("Esiste già un lavoratore con questo nome, per favore scegli un nome diverso.");

  if (editingWorkerIndex !== -1) {
    lavoratore.index = editingWorkerIndex;
    workers = workers.map(w => w.index === editingWorkerIndex ? lavoratore : w);
    editingWorkerIndex = -1;
  } else {
    workers.push(lavoratore);
  }

  renderWorkers();
  closeworker();
  document.getElementById("nome").value = "";
  document.querySelector('#maxOreInput').value = "";
  storeAll();
}

function eliminaLavoratore(i) {
  workers = workers.filter(w => w.index !== i);
  renderWorkers();
  storeAll();
}

function editWorker(i) {
  const w = workers.find(w => w.index === i);
  if (!w) return;
  editingWorkerIndex = i;
  document.getElementById("addworkerpage").style.display = "flex";
  document.getElementById("nome").value = w.nome;
  document.querySelector('#maxOreInput').value = w.maxOre;
  renderCustomRuoli(w.ruoli);
  renderAvailabilityTable(w.disponibilita);
}

function renderWorkers() {
  const track = document.getElementById("track");
  track.innerHTML = "";
  workers.forEach(w => track.appendChild(w.generaCard()));
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
  
  let turnOptions = "";
  turnTypes.forEach(t => {
      turnOptions += `<option value="${t.name}">${t.name} (${t.start}-${t.end})</option>`;
  });

  row.innerHTML = `
    <select class="day-select">
      ${GIORNI_SETTIMANA.map(g => `<option>${g}</option>`).join("")}
    </select>
    <select class="turno-select">
      ${turnOptions}
    </select>
    <input class="small-input persone-input" type="number" min="1" step="1" placeholder="# pers" value="1">
    <button class="delete-shift">X</button>`;
  
  if (prefill) {
    row.querySelector(".day-select").value = prefill.giorno;
    row.querySelector(".turno-select").value = prefill.turno;
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
    persone: parseInt(row.querySelector(".persone-input").value, 10) || 1
  }));
  return new Ruolo(nome, shifts);
}

function aggiungiRuoloEChiudi() {
  const ruolo = createRoleFromInput();
  if (!ruolo.nome || ruolo.shifts.length === 0)
    return alert("Completa nome e almeno un turno.");
  
  if (editingRoleIndex !== -1) {
    ruolo.index = editingRoleIndex;
    roles = roles.map(r => r.index === editingRoleIndex ? ruolo : r);
  } else {
    roles.push(ruolo);
  }
  
  editingRoleIndex = -1;
  renderRoles();
  closerole();
  renderCustomRuoli();
  storeAll();
}

function editRole(i) {
  const r = roles.find(r => r.index === i);
  if (!r) return;
  editingRoleIndex = i;
  document.getElementById("addrolepage").style.display = "flex";
  document.getElementById("roleName").value = r.nome;
  const cont = document.getElementById("roleShiftsContainer");
  cont.innerHTML = "";
  r.shifts.forEach(s => addShiftRow(s));
}

function duplicateRole(i) {
    const original = roles.find(r => r.index === i);
    if (!original) return;
    
    editingRoleIndex = -1; 
    document.getElementById("addrolepage").style.display = "flex";
    
    document.getElementById("roleName").value = ""; 
    const cont = document.getElementById("roleShiftsContainer");
    cont.innerHTML = "";
    original.shifts.forEach(s => addShiftRow(s));
}

function eliminaRuolo(i) {
  roles = roles.filter(r => r.index !== i);
  renderRoles();
  renderCustomRuoli();
  storeAll();
}

function renderRoles() {
  const wrapper = document.getElementById("ruoliWrapper");
  wrapper.innerHTML = "";
  roles.forEach(r => wrapper.appendChild(r.generaCard()));
}

// =================== SALVATAGGIO / LOGIN / LOCAL ===================
function storeAll() {
  const value = { 
      workers: workers.map(w => w.serialize()), 
      roles: roles.map(r => r.serialize()),
      turnTypes: turnTypes 
  };
  
  if (psw) storeData(psw, value);
}

function loadAll() {
  loadData(psw).then(data => {
    if (!data) throw new Error("Codice non trovato.");
    restoreDataState(data);
  }).catch(err => console.error(err));
}

function restoreDataState(data) {
    if(data.turnTypes && Array.isArray(data.turnTypes)) {
        turnTypes = data.turnTypes;
    }
    
    workers = (data.workers || []).map(w => new Lavoratore(w.nome, w.ruoli, w.disponibilita, w.maxOre));
    roles = (data.roles || []).map(r => new Ruolo(r.nome, r.shifts));
    
    worker_index = workers.length > 0 ? Math.max(...workers.map(w => w.index)) + 1 : 0;
    role_index = roles.length > 0 ? Math.max(...roles.map(r => r.index)) + 1 : 0;

    renderWorkers();
    renderRoles();
    renderCustomRuoli();
}

async function inList() {
  try {
    const response = await fetch(`${BACKEND_URL}/inList`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: psw })
    });
    return await response.json();
  } catch (err) {
    return false;
  }
}

async function login() {
  psw = document.getElementById("codice").value.trim();
  if (!psw) return alert("Inserisci un codice.");
  const btn = document.getElementById("logbutton");
  btn.disabled = true; btn.innerText = "Attendere...";
  await inList().then(resp => {
    if (!resp.valid) return alert("Codice non valido.");
    document.getElementById("loginpage").style.display = "none";
    loadAll();
  });
  btn.disabled = false; btn.innerText = "Login";
}

function saveLocal() {
    const data = {
        workers: workers.map(w => w.serialize()),
        roles: roles.map(r => r.serialize()),
        turnTypes: turnTypes
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shiftly_backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadLocal(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            restoreDataState(data);
            alert("Dati caricati con successo!");
            if(psw) storeAll(); 
        } catch(err) {
            alert("Errore nella lettura del file: " + err);
        }
    };
    reader.readAsText(file);
    input.value = "";
}