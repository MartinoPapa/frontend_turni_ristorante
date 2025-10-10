// Serializza un lavoratore in oggetto plain
class Lavoratore {
  constructor(nome, ruoli, disponibilita, maxOre) {
    this.nome = nome;
    this.ruoli = ruoli;
    this.disponibilita = disponibilita;
    this.maxOre = maxOre;
    this.index = -1;
    this.article = null;
  }

  generaCard() {
    const article = document.createElement("article");
    this.article = article;
    workers.push(this);
    this.index = worker_index++;
    article.classList.add("card");
    article.setAttribute("role", "group");
    article.setAttribute("aria-label", `Card ${this.nome}`);

    article.innerHTML = `
      <h4>${this.nome}</h4>
      <h6>${this.ruoli.join(", ")}</h6>
      <h5>Disponibilità</h5>
      <table class="schedule-table">
        <thead>
          <tr>
            <th></th>
            <th>Pranzo</th>
            <th>Cena</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(this.disponibilita).map(([giorno, disp]) => `
            <tr>
              <td>${giorno}</td>
              <td class="${disp.pranzo ? "yes" : "no"}">${disp.pranzo ? "Sì" : "No"}</td>
              <td class="${disp.cena ? "yes" : "no"}">${disp.cena ? "Sì" : "No"}</td>
            </tr>
          `).join("")}
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

// Variabili globali
let workers = [];
let worker_index = 0;
const container = document.getElementById("track");

// Aggiunge un lavoratore al container
function aggiungiLavoratore(lavoratore) {
  container.appendChild(lavoratore.generaCard());
}

// Elimina lavoratore
function eliminaLavoratore(i) {
  const lavoratore = workers.find(w => w.index === i);
  if (lavoratore && lavoratore.article?.parentNode) {
    lavoratore.article.parentNode.removeChild(lavoratore.article);
  }
  workers = workers.filter(w => w.index !== i);
}

// Funzioni per aprire/chiudere form
function openworker() { document.getElementById("addworkerpage").style.display = "flex"; }
function closeworker() { document.getElementById("addworkerpage").style.display = "none"; }

// Crea lavoratore da form
function creaLavoratoreDaInput() {
  const nome = document.getElementById("nome").value.trim();
  const ruoli = document.getElementById("ruolo").value.split(",").map(r => r.trim()).filter(r => r);
  const maxOre = parseInt(document.querySelector('input[type="number"]').value, 10);

  const table = document.getElementById("scheduleTable");
  const rows = table.querySelectorAll("tbody tr");
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

// Aggiungi e chiudi form
function aggiungiEChiudi() {
  const lavoratore = creaLavoratoreDaInput();
  aggiungiLavoratore(lavoratore);
  closeworker();
  clearAddWorkerForm();
}

// Resetta form
function clearAddWorkerForm() {
  document.getElementById("nome").value = "";
  document.getElementById("ruolo").value = "";
  document.querySelector('input[type="number"]').value = "";
  const rows = document.getElementById("scheduleTable").querySelectorAll("tbody tr");
  rows.forEach(row => {
    row.cells[1].querySelector("input").checked = false;
    row.cells[2].querySelector("input").checked = false;
  });
}

psw = ""

// Funzioni fetch per il backend
async function storeData(key, value) {
  try {
    const response = await fetch("https://backend-turni-ristorante.onrender.com/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error storing data:", errorData);
      return;
    }
    console.log("Data stored successfully");
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

async function loadData(key) {
  try {
    const response = await fetch("https://backend-turni-ristorante.onrender.com/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error loading data:", errorData);
      return null;
    }
    const data = await response.json();
    return data.value;
  } catch (err) {
    console.error("Fetch error:", err);
    return null;
  }
}

// Salva tutti i lavoratori sul server
function storeWorkers() {
  const validWorkers = workers
    .filter(w => w.nome && w.ruoli.length > 0 && !isNaN(w.maxOre))
    .map(w => w.serialize());

  const dataToStore = { workers: validWorkers };
  storeData("workers"+psw, dataToStore);
}

// Carica lavoratori dal server e crea le card
function loadWorkers() {
  try{
    loadData("workers"+psw).then(value => {
    if (value?.workers?.length) {
      value.workers.forEach(wData => {
        const lavoratore = new Lavoratore(
          wData.nome,
          wData.ruoli,
          wData.disponibilita,
          wData.maxOre
        );
        aggiungiLavoratore(lavoratore);
      });
    }
  });
  }catch{
    alert("codice non trovato");
  }
  
}

function caricaDati(){
  psw = document.getElementById("codice").value;
  loadWorkers();
}

function salvaDati(){
  psw = document.getElementById("codice").value;
  storeWorkers();
}

