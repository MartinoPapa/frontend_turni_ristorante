// ==========================================
// GESTIONE FRONTEND: lavoratori + ruoli + turni
// ==========================================

let workers = [];
let roles = [];
let turnTypes = [
    { name: "Pranzo", start: "11:00", end: "15:00" },
    { name: "Cena", start: "18:00", end: "23:00" }
];

let worker_index = 0;
let role_index = 0;
let session = null; // Sessione Supabase (sostituisce psw)
let isDemo = false;
let editingRoleIndex = -1;
let editingWorkerIndex = -1;

// ---------------------
// CONFIGURAZIONE
// ---------------------
const BACKEND_URL = "https://backend-turni-ristorante.onrender.com";
const SUPABASE_URL = "https://mkxxwghoclxbqhsbxpyr.supabase.co";
const SUPABASE_KEY = "sb_publishable_OD1Vlbww7r_u_PQy3pr63Q_bmBvwS8x";

// Inizializzazione client Supabase (usa la libreria caricata da CDN)
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// =================== HELPER ===================
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

// =================== SUPABASE: STORE / LOAD ===================

/**
 * Salva i dati del ristorante nel database Supabase.
 * Usa upsert per creare o aggiornare la riga dell'utente.
 */
async function storeAll() {
    if (!session) return;
    const userId = session.user.id;
    const payload = {
        user_id: userId,
        data: {
            workers: workers.map(w => w.serialize()),
            roles: roles.map(r => r.serialize()),
            turnTypes
        }
    };
    const { error } = await supabaseClient
        .from("restaurant_data")
        .upsert(payload, { onConflict: "user_id" });
    if (error) console.error("Store error:", error.message);
}

/**
 * Carica i dati del ristorante da Supabase e aggiorna la UI.
 * Se non esistono dati, parte da uno stato vuoto (default).
 */
async function loadAll() {
    if (!session) return;

    // Aggiorna il titolo con il nome dell'utente (email prefix)
    const displayName = session.user.user_metadata?.display_name
        || session.user.email.split("@")[0];
    document.getElementById("Title").innerText = displayName + " - Gestionale Turni";
    document.title = "Shiftly | " + displayName;

    const { data, error } = await supabaseClient
        .from("restaurant_data")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

    if (error) {
        console.error("Load error:", error.message);
        return;
    }

    if (data && data.data) {
        restore(data.data);
    }
    // Se non ci sono dati, si parte con lo stato di default (workers/roles/turnTypes già inizializzati)
}

// =================== TURNI (CONFIGURAZIONE ORARI) ===================
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
        row.innerHTML = `
            <input type="text" value="${t.name}" class="turn-name" placeholder="nome del turno">
            <input type="time" value="${t.start}" class="time-input turn-start">
            <span>-</span>
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
    if (!confirm("Sicuro di voler eliminare?")) return;
    turnTypes = syncTurnTypesFromDOM();
    turnTypes.splice(index, 1);
    renderTurnTypesEditor();
}

function saveTurnTypesAndClose() {
    const rows = document.querySelectorAll(".turn-type-row");
    const newTypes = [];
    let errorMsg = null;

    rows.forEach(row => {
        const nameRaw = row.querySelector(".turn-name").value.trim();
        const start = row.querySelector(".turn-start").value;
        const end = row.querySelector(".turn-end").value;

        if (!nameRaw) errorMsg = "Tutte le tipologie devono avere un nome.";
        if (!start || !end) errorMsg = "Tutti i turni devono avere orari validi.";

        newTypes.push({ name: capitalize(nameRaw), start, end });
    });

    if (errorMsg) return alert("Errore: " + errorMsg);

    // 1. Gestione rinominazione turni esistenti
    const limit = Math.min(turnTypes.length, newTypes.length);
    for (let i = 0; i < limit; i++) {
        const oldName = turnTypes[i].name;
        const newName = newTypes[i].name;

        if (oldName && newName && oldName !== newName) {
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
                r.shifts.forEach(s => { if (s.turno === oldName) s.turno = newName; });
            });
        }
    }

    // 2. Inizializza nuovi turni aggiunti come 'false'
    if (newTypes.length > turnTypes.length) {
        for (let i = turnTypes.length; i < newTypes.length; i++) {
            const newTName = newTypes[i].name;
            workers.forEach(w => {
                if (w.disponibilita) {
                    for (const day in w.disponibilita) {
                        if (w.disponibilita[day][newTName] === undefined) {
                            w.disponibilita[day][newTName] = false;
                        }
                    }
                }
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
    }
    generaCard() {
        const article = document.createElement("article");
        article.classList.add("card");
        const ths = turnTypes.map(t => `<th>${t.name.substr(0, 3)}</th>`).join("");
        const tableRows = GIORNI_SETTIMANA.map(giorno => {
            const disp = (this.disponibilita && this.disponibilita[giorno]) || {};
            const tds = turnTypes.map(t => {
                const isAvail = disp[t.name] === true;
                return `<td class="${isAvail ? "yes" : "no"}">${isAvail ? "✓" : "✗"}</td>`;
            }).join("");
            return `<tr><td>${giorno.substr(0, 3)}</td>${tds}</tr>`;
        }).join("");

        const roleTags = this.ruoli.map(r => `<span class="worker-role-tag">${r}</span>`).join("");

        article.innerHTML = `
          <div class="card-top-row">
            <h4>${this.nome}</h4>
            <span class="worker-hours-pill">${this.maxOre}h/sett</span>
          </div>
          <div class="worker-role-tags">${roleTags}</div>
          <h5>Disponibilità</h5>
          <div class="card-table-wrap">
            <table class="schedule-table"><thead><tr><th></th>${ths}</tr></thead><tbody>${tableRows}</tbody></table>
          </div>
          <div class="trebottoni">
            <button onclick="editWorker(${this.index})">Modifica</button>
            <button onclick="eliminaLavoratore(${this.index})">Elimina</button>
          </div>
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
    }
    generaCard() {
        const article = document.createElement("div");
        article.classList.add("ruolo");
        const shiftRows = this.shifts.map(s => {
            return `<tr><td>${s.giorno}</td><td><span class="shift-turn-tag">${s.turno}</span></td><td><span class="pers-badge">${s.persone}</span></td></tr>`;
        }).join("");
        article.innerHTML = `
          <div class="card-top-row">
            <h4>${this.nome}</h4>
          </div>
          <div class="card-table-wrap">
            <table class="shift-table">
              <thead><tr><th>Giorno</th><th>Turno</th><th>Pers.</th></tr></thead>
              <tbody>${shiftRows}</tbody>
            </table>
          </div>
          <div class="trebottoni">
            <button onclick="editRole(${this.index})">Modifica</button>
            <button onclick="duplicateRole(${this.index})" class="btn-duplicate">Duplica</button>
            <button onclick="eliminaRuolo(${this.index})">Elimina</button>
          </div>`;
        return article;
    }
    serialize() { return { nome: this.nome, shifts: this.shifts }; }
}

// =================== WORKER UI (CHIPS) ===================
const GIORNI_SETTIMANA = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function renderCustomRuoli(selectedArr = []) {
    const container = document.getElementById("ruoloSelectContainer");
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "chip-container";

    if (roles.length === 0) {
        wrapper.innerHTML = "<span style='color:#777; font-size:0.9em; padding:5px;'>Nessun ruolo creato. Aggiungi prima un ruolo.</span>";
    }

    roles.forEach(r => {
        const chip = document.createElement("div");
        chip.className = "role-chip";
        if (selectedArr.includes(r.nome)) chip.classList.add("selected");
        chip.innerText = r.nome;
        chip.onclick = () => { chip.classList.toggle("selected"); };
        wrapper.appendChild(chip);
    });

    container.appendChild(wrapper);
}

function getSelectedRuoli() {
    const selectedChips = document.querySelectorAll(".role-chip.selected");
    return Array.from(selectedChips).map(chip => chip.innerText);
}

function renderAvailabilityTable(currentData = {}) {
    const tbody = document.querySelector("#scheduleTable tbody");
    const thead = document.querySelector("#scheduleTable thead");
    thead.innerHTML = "<tr><th></th>" + turnTypes.map(t => `<th>${t.name}</th>`).join("") + "</tr>";
    tbody.innerHTML = "";
    GIORNI_SETTIMANA.forEach(g => {
        let html = `<td>${g.substr(0, 3)}</td>`;
        turnTypes.forEach(t => {
            const chk = currentData[g] && currentData[g][t.name];
            html += `<td><input type="checkbox" data-d="${g}" data-t="${t.name}" ${chk === true ? "checked" : ""}></td>`;
        });
        tbody.innerHTML += `<tr>${html}</tr>`;
    });
}

function selezionaTuttiTurni() {
    document.querySelectorAll("#scheduleTable input[type=checkbox]").forEach(c => {
        c.checked = true;
    });
}

function openworker() {
    editingWorkerIndex = -1;
    document.getElementById("addworkerpage").style.display = "flex";
    document.getElementById("nome").value = "";
    document.getElementById("maxOreInput").value = "";
    renderCustomRuoli();
    renderAvailabilityTable(getInitialAvailability(false));
}

function getInitialAvailability(val) {
    let a = {};
    GIORNI_SETTIMANA.forEach(d => {
        a[d] = {};
        turnTypes.forEach(t => a[d][t.name] = val);
    });
    return a;
}

function closeworker() { document.getElementById("addworkerpage").style.display = "none"; }

function aggiungiEChiudi() {
    const nome = document.getElementById("nome").value.trim();
    const ruoli = getSelectedRuoli();
    const maxOre = parseFloat(document.getElementById("maxOreInput").value);

    if (!nome) return alert("Inserisci nome.");
    if (!ruoli.length) return alert("Seleziona almeno un ruolo.");
    if (!maxOre || maxOre <= 0) return alert("Ore non valide.");

    const disp = {};
    document.querySelectorAll("#scheduleTable input[type=checkbox]").forEach(c => {
        const d = c.getAttribute("data-d"), t = c.getAttribute("data-t");
        if (!disp[d]) disp[d] = {};
        disp[d][t] = c.checked;
    });

    const newW = new Lavoratore(nome, ruoli, disp, maxOre);

    if (editingWorkerIndex !== -1) {
        newW.index = editingWorkerIndex;
        workers = workers.map(w => w.index === editingWorkerIndex ? newW : w);
    } else {
        if (workers.some(w => w.nome.toLowerCase() === nome.toLowerCase())) return alert("Nome esistente.");
        workers.push(newW);
    }
    closeworker();
    setSectionCollapsed("sectionPersonale", false);
    renderWorkers();
    storeAll();
}

function editWorker(i) {
    const w = workers.find(x => x.index === i);
    if (!w) return;
    editingWorkerIndex = i;
    document.getElementById("addworkerpage").style.display = "flex";
    document.getElementById("nome").value = w.nome;
    document.getElementById("maxOreInput").value = w.maxOre;
    renderCustomRuoli(w.ruoli);
    renderAvailabilityTable(w.disponibilita);
}
function eliminaLavoratore(i) {
    if (!confirm("Sicuro di voler eliminare?")) return;
    workers = workers.filter(w => w.index !== i);
    renderWorkers();
    storeAll();
}
function renderWorkers() {
    const track = document.getElementById("track");
    track.innerHTML = "";
    if (workers.length === 0) {
        track.innerHTML = `<div class="empty-state-box">Nessun lavoratore inserito. Clicca su <strong>+ Personale</strong> per aggiungere il tuo team.</div>`;
        return;
    }
    workers.forEach(w => track.appendChild(w.generaCard()));
}

// =================== ROLE UI ===================
function openrole() { editingRoleIndex = -1; document.getElementById("addrolepage").style.display = "flex"; document.getElementById("roleName").value = ""; document.getElementById("roleShiftsContainer").innerHTML = ""; addShiftRow(); }
function closerole() { document.getElementById("addrolepage").style.display = "none"; }

function addShiftRow(pre = null) {
    const div = document.createElement("div");
    div.className = "shift-row";
    div.innerHTML = `
      <select class="ds">${GIORNI_SETTIMANA.map(g => `<option>${g}</option>`).join("")}</select>
      <select class="ts">${turnTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}</select>
      <input type="number" min="1" value="1" class="pi">
      <button class="delete-shift">X</button>
    `;
    div.querySelector(".delete-shift").onclick = () => div.remove();
    if (pre) { div.querySelector(".ds").value = pre.giorno; div.querySelector(".ts").value = pre.turno; div.querySelector(".pi").value = pre.persone; }
    document.getElementById("roleShiftsContainer").appendChild(div);
}

function aggiungiRuoloEChiudi() {
    const nome = document.getElementById("roleName").value.trim();
    if (!nome) return alert("Inserisci nome ruolo.");

    const nomeEsiste = roles.some(r => r.nome.toLowerCase() === nome.toLowerCase() && r.index !== editingRoleIndex);
    if (nomeEsiste) return alert("Esiste già un ruolo con questo nome.");

    const shifts = [];
    let err = false;
    document.querySelectorAll(".shift-row").forEach(r => {
        const p = parseInt(r.querySelector(".pi").value);
        if (p < 1) err = true;
        shifts.push({ giorno: r.querySelector(".ds").value, turno: r.querySelector(".ts").value, persone: p });
    });
    if (err || !shifts.length) return alert("Controlla i turni.");

    const newR = new Ruolo(nome, shifts);
    if (editingRoleIndex !== -1) {
        const oldRoleName = roles.find(r => r.index === editingRoleIndex).nome;
        if (oldRoleName !== nome) {
            workers.forEach(w => {
                const roleIdx = w.ruoli.indexOf(oldRoleName);
                if (roleIdx !== -1) { w.ruoli[roleIdx] = nome; }
            });
        }
        newR.index = editingRoleIndex;
        roles = roles.map(r => r.index === editingRoleIndex ? newR : r);
    } else {
        roles.push(newR);
    }

    closerole();
    setSectionCollapsed("sectionRuoli", false);
    renderRoles();
    renderWorkers();
    renderCustomRuoli();
    storeAll();
}
function editRole(i) {
    const r = roles.find(x => x.index === i);
    editingRoleIndex = i;
    document.getElementById("addrolepage").style.display = "flex";
    document.getElementById("roleName").value = r.nome;
    document.getElementById("roleShiftsContainer").innerHTML = "";
    r.shifts.forEach(s => addShiftRow(s));
}
function duplicateRole(i) {
    const r = roles.find(x => x.index === i);
    editingRoleIndex = -1;
    document.getElementById("addrolepage").style.display = "flex";
    document.getElementById("roleName").value = "";
    document.getElementById("roleShiftsContainer").innerHTML = "";
    r.shifts.forEach(s => addShiftRow(s));
}
function eliminaRuolo(i) {
    if (!confirm("Sicuro di voler eliminare?")) return;
    roles = roles.filter(r => r.index !== i);
    renderRoles();
    renderCustomRuoli();
    storeAll();
}
function renderRoles() {
    const wrap = document.getElementById("ruoliWrapper");
    wrap.innerHTML = "";
    if (roles.length === 0) {
        wrap.innerHTML = `<div class="empty-state-box">Nessun ruolo configurato. Clicca su <strong>+ Ruolo</strong> per definire i turni richiesti.</div>`;
        return;
    }
    roles.forEach(r => wrap.appendChild(r.generaCard()));
}

// =================== AUTH (SUPABASE) ===================

/**
 * Login con Supabase Auth tramite email e password.
 * Dopo il login, carica i dati dell'utente dal database.
 */
async function login() {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const btn = document.getElementById("logbutton");
    const originalText = btn.innerText;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email) return alert("Inserisci la tua email.");
    if (!password) return alert("Inserisci la password.");

    // Stato loading
    btn.disabled = true;
    btn.innerText = "Attendere...";

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            alert("Credenziali non valide: " + error.message);
            btn.disabled = false;
            btn.innerText = originalText;
            return;
        }

        session = data.session;
        isDemo = false;
        document.getElementById("loginpage").style.display = "none";
        document.getElementById("demoBanner").style.display = "none";
        document.body.classList.remove("login-active");
        await loadAll();

        btn.disabled = false;
        btn.innerText = originalText;

    } catch (e) {
        console.error("Login error:", e);
        alert("Errore di connessione. Riprova.");
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// =================== MODALITÀ DEMO ===================

/**
 * Avvia la modalità demo senza credenziali, pre-caricando dati di esempio
 * per permettere all'utente di testare subito l'interfaccia.
 */
function startDemo() {
    isDemo = true;
    session = null;

    document.getElementById("loginpage").style.display = "none";
    document.getElementById("demoBanner").style.display = "block";
    document.body.classList.remove("login-active");
    document.body.classList.remove("login-active");

    document.getElementById("Title").innerText = "Demo - Gestionale Turni";
    document.title = "Shiftly | Modalità Demo";

    // Se non ci sono già dati inseriti nella sessione demo, carica un esempio realistico
    if (workers.length === 0 && roles.length === 0) {
        restore({
            turnTypes: [
                { name: "Pranzo", start: "11:00", end: "15:00" },
                { name: "Cena", start: "18:00", end: "23:00" }
            ],
            roles: [
                {
                    nome: "Sala",
                    shifts: [
                        { giorno: "Venerdì", turno: "Cena", persone: 2 },
                        { giorno: "Sabato", turno: "Cena", persone: 3 },
                        { giorno: "Domenica", turno: "Pranzo", persone: 2 }
                    ]
                },
                {
                    nome: "Cucina",
                    shifts: [
                        { giorno: "Venerdì", turno: "Cena", persone: 2 },
                        { giorno: "Sabato", turno: "Cena", persone: 2 },
                        { giorno: "Domenica", turno: "Pranzo", persone: 2 }
                    ]
                }
            ],
            workers: [
                {
                    nome: "Marco",
                    ruoli: ["Sala"],
                    maxOre: 30,
                    disponibilita: {
                        "Lunedì": { "Pranzo": true, "Cena": false },
                        "Martedì": { "Pranzo": true, "Cena": true },
                        "Mercoledì": { "Pranzo": false, "Cena": true },
                        "Giovedì": { "Pranzo": true, "Cena": true },
                        "Venerdì": { "Pranzo": true, "Cena": true },
                        "Sabato": { "Pranzo": false, "Cena": true },
                        "Domenica": { "Pranzo": true, "Cena": false }
                    }
                },
                {
                    nome: "Giulia",
                    ruoli: ["Sala", "Cucina"],
                    maxOre: 35,
                    disponibilita: {
                        "Lunedì": { "Pranzo": false, "Cena": true },
                        "Martedì": { "Pranzo": true, "Cena": false },
                        "Mercoledì": { "Pranzo": true, "Cena": true },
                        "Giovedì": { "Pranzo": false, "Cena": true },
                        "Venerdì": { "Pranzo": true, "Cena": true },
                        "Sabato": { "Pranzo": true, "Cena": true },
                        "Domenica": { "Pranzo": true, "Cena": true }
                    }
                }
            ]
        });
    } else {
        renderWorkers();
        renderRoles();
        renderCustomRuoli();
    }
}

/**
 * Esce dalla modalità demo, pulisce i dati temporanei e riporta al login.
 */
function exitDemo() {
    isDemo = false;
    session = null;
    closeDemoModal();

    turnTypes = [
        { name: "Pranzo", start: "11:00", end: "15:00" },
        { name: "Cena", start: "18:00", end: "23:00" }
    ];
    workers = [];
    roles = [];
    worker_index = 0;
    role_index = 0;
    renderWorkers();
    renderRoles();
    renderCustomRuoli();

    const genEl = document.getElementById("datiGenerati");
    if (genEl) genEl.style.display = "none";
    hasGeneratedSchedule = false;
    setSectionCollapsed("sectionPianificazione", true);
    const togglePianBtn = document.getElementById("togglePianificazioneBtn");
    if (togglePianBtn) {
        togglePianBtn.disabled = true;
        togglePianBtn.title = "Genera prima i turni per espandere";
    }
    document.getElementById("demoBanner").style.display = "none";
    document.getElementById("loginpage").style.display = "flex";
    document.body.classList.add("login-active");
    document.title = "Shiftly";
}

function openDemoModal(reason = "upgrade") {
    const badge = document.getElementById("demoModalBadge");
    const title = document.getElementById("demoModalTitle");
    const desc = document.getElementById("demoModalDesc");

    if (reason === "generate") {
        badge.innerText = "Funzione bloccata nella Demo";
        badge.className = "demo-modal-badge warning";
        title.innerText = "Generazione turni non disponibile nella Demo";
        desc.innerText = "Nella modalità dimostrativa non è possibile generare i turni. Richiedi la versione definitiva per sbloccare l'algoritmo di generazione automatica, l'esportazione in Excel o Pdf e il salvataggio nel cloud.";
    } else {
        badge.innerText = "Versione Definitiva";
        badge.className = "demo-modal-badge";
        title.innerText = "Passa alla versione definitiva";
        desc.innerText = "Contattaci per attivare il tuo account dedicato: potrai salvare permanentemente ruoli e personale, generare automaticamente i turni della settimana ed esportarli in Excel o Pdf.";
    }

    document.getElementById("demoModal").style.display = "flex";
}

function closeDemoModal() {
    const modal = document.getElementById("demoModal");
    if (modal) modal.style.display = "none";
}

/**
 * Ripristina lo stato dell'app da un oggetto dati serializzato.
 */
function restore(d) {
    if (d.turnTypes) turnTypes = d.turnTypes;
    workers = (d.workers || []).map(w => new Lavoratore(w.nome, w.ruoli, w.disponibilita, w.maxOre));
    roles = (d.roles || []).map(r => new Ruolo(r.nome, r.shifts));
    worker_index = workers.length ? Math.max(...workers.map(w => w.index)) + 1 : 0;
    role_index = roles.length ? Math.max(...roles.map(r => r.index)) + 1 : 0;
    renderWorkers(); renderRoles(); renderCustomRuoli();
}

// =================== BACKUP LOCALE ===================
function saveLocal() {
    const blob = new Blob(
        [JSON.stringify({ workers: workers.map(w => w.serialize()), roles: roles.map(r => r.serialize()), turnTypes }, null, 2)],
        { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shiftly_backup.json";
    a.click();
}
function loadLocal(input) {
    const f = input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            restore(JSON.parse(e.target.result));
            alert("Dati caricati correttamente!");
            if (session) storeAll(); // Sincronizza su Supabase se loggato
        } catch (x) {
            alert("Errore nel caricamento del file");
        }
    };
    r.readAsText(f);
}

// =================== COPY EMAIL ===================
function copyEmail(e, email) {
    e.preventDefault();
    const targetEl = e.currentTarget;
    const label = (targetEl && targetEl.querySelector(".email-copy-label"))
        || document.getElementById("emailLabel");

    const showCopiedFeedback = () => {
        if (!label) return;
        if (!label.dataset.originalText) {
            label.dataset.originalText = label.innerText;
        }
        label.innerText = "Email Copiata!";
        clearTimeout(label._copyTimeout);
        label._copyTimeout = setTimeout(() => {
            label.innerText = label.dataset.originalText;
        }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(showCopiedFeedback).catch(() => {
            fallbackCopyText(email, showCopiedFeedback);
        });
    } else {
        fallbackCopyText(email, showCopiedFeedback);
    }
}

function fallbackCopyText(text, onSuccess) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
        if (onSuccess) onSuccess();
    } catch (err) {
        console.error("Errore nella copia: ", err);
    }
    document.body.removeChild(ta);
}

// =================== INVIO DA TASTIERA (LOGIN E MODALI) ===================
document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.target && e.target.tagName === "TEXTAREA") return;

    const workerModal = document.getElementById("addworkerpage");
    if (workerModal && getComputedStyle(workerModal).display !== "none") {
        e.preventDefault();
        aggiungiEChiudi();
        return;
    }

    const roleModal = document.getElementById("addrolepage");
    if (roleModal && getComputedStyle(roleModal).display !== "none") {
        e.preventDefault();
        aggiungiRuoloEChiudi();
        return;
    }

    const turnTypesModal = document.getElementById("turntypespage");
    if (turnTypesModal && getComputedStyle(turnTypesModal).display !== "none") {
        e.preventDefault();
        saveTurnTypesAndClose();
        return;
    }

    const demoModal = document.getElementById("demoModal");
    if (demoModal && getComputedStyle(demoModal).display !== "none") {
        return;
    }

    const loginPage = document.getElementById("loginpage");
    if (loginPage && getComputedStyle(loginPage).display !== "none") {
        const logBtn = document.getElementById("logbutton");
        if (logBtn && !logBtn.disabled) {
            e.preventDefault();
            login();
        }
    }
});

// =================== COMPRESSIONE / ESPANSIONE SEZIONI ===================
let hasGeneratedSchedule = false;

function toggleSection(sectionId) {
    if (sectionId === "sectionPianificazione" && !hasGeneratedSchedule) {
        return;
    }
    const section = document.getElementById(sectionId);
    if (!section) return;
    const isCollapsed = section.classList.toggle("is-collapsed");
    updateSectionToggleBtn(section, isCollapsed);
}

function setSectionCollapsed(sectionId, collapsed) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.classList.toggle("is-collapsed", collapsed);
    updateSectionToggleBtn(section, collapsed);
}

function updateSectionToggleBtn(section, isCollapsed) {
    const btn = section.querySelector(".section-toggle-btn");
    if (!btn) return;
    btn.setAttribute("aria-expanded", String(!isCollapsed));
    btn.title = isCollapsed ? "Espandi sezione" : "Comprimi sezione";
}