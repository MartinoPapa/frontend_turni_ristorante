function getWorkers() {
    for (const w of workers) {
        workers_id.push(w.nome);
        max_hours_per_worker[w.nome] = w.maxOre;
    }
}

workers_id = []
max_hours_per_worker = {}
shifts = []
hoursPerShift = {}
availability = {}
forbiddenSet = []

function getShifts() {
    for (const r of roles) {
        i = 0;
        persone_qualificate = [];
        ruolo = r.nome.toLowerCase();
        r.nome = r.nome.toLowerCase();
        // find all qualified people for this role
        for (const w of workers) {
            w.ruoli = w.ruoli.map(s => typeof s === "string" ? s.toLowerCase() : s);
            if (w.ruoli.includes(ruolo)) {
                persone_qualificate.push(w.nome);
            }
        }
        // for each shift in the role
        for (const s of r.shifts) {
            s.i = s.giorno.toLowerCase() + "/" + s.turno.toLowerCase(); // serve per il forbidden set
            // need one shift for each person required
            for (let j = 0; j < s.persone; j++) {
                shifts.push(r.nome + "-" + s.i.toString() + "-" + j.toString()); // roleIndex-shiftIndex-shiftPersonIndex
                hoursPerShift[r.nome + "-" + s.i.toString() + "-" + j.toString()] = s.ore;
                for (const p of workers) {
                    // se qualificato e disponibile 1 altrimenti 0
                    if (persone_qualificate.includes(p.nome) && p.disponibilita[s.giorno][s.turno.toLowerCase()]) {
                        availability[p.nome + "," + r.nome + "-" + s.i.toString() + "-" + j.toString()] = 1;
                    } else {
                        availability[p.nome + "," + r.nome + "-" + s.i.toString() + "-" + j.toString()] = 0;
                    }
                }
            }
            i += 1;
        }
    }
}

function getForbiddenSet() {
    const grouped = {};
    //shift raggruppati per giorno e turno
    roles.forEach(role => {
        role.shifts.forEach(s => {
            const key = `${s.giorno}_${s.turno}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({
                role: role.nome,
                ...s
            });
        });
    });

    const groupedArray = Object.entries(grouped).map(([key, shifts]) => {
        const [giorno, turno] = key.split("_");
        return { giorno, turno, shifts };
    });

    for (let index = 0; index < groupedArray.length; index++) {
        g = groupedArray[index];
        forbiddenSubset = [];
        for (let internal_index = 0; internal_index < g.shifts.length; internal_index++) {
            s = g.shifts[internal_index];
            nomei = s.role + "-" + s.i;
            for (let j = 0; j < s.persone; j++) {
                forbiddenSubset.push(nomei + "-" + j.toString());
            }
        }
        forbiddenSet.push(forbiddenSubset);
    }
}

function clearSets() {
    workers_id = []
    max_hours_per_worker = {}
    shifts = []
    hoursPerShift = {}
    availability = {}
    forbiddenSet = []
}

function printSets() {
    console.log("workers_id: ", workers_id);
    console.log("max_hours_per_worker: ", max_hours_per_worker);
    console.log("shifts: ", shifts);
    console.log("hoursPerShift: ", hoursPerShift);
    console.log("availability: ", availability);
    console.log("forbiddenSet: ", forbiddenSet);
}

function generaSets() {
    clearSets();
    getWorkers();
    getShifts();
    getForbiddenSet();
}

function downloadPayload(payload, filename = "payload.txt") {
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // necessario per Firefox: aggiungere al DOM, click, poi rimuovere
    document.body.appendChild(a);
    a.click();
    a.remove();

    // libera la risorsa
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getSchedule() {
    generaSets();

    payload = {
        "workers": workers_id,
        "shifts": shifts,
        "H": hoursPerShift,
        "M": max_hours_per_worker,
        "avail": availability,
        "forbidden_pairs": forbiddenSet
    };

    document.getElementById("btngenera").innerHTML = "Attendere...";
    try {
        const response = await fetch("https://backend-turni-ristorante.onrender.com/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            alert("Il personale disponibile non è sufficiente per coprire tutti i turni richiesti.");
            document.getElementById("btngenera").innerHTML = "Genera Turni";
            return;
        }

        let data = await response.json();
        stampa(data);
        document.getElementById("datiGenerati").style.display = "flex";
        document.getElementById("btngenera").innerHTML = "Genera Turni";

    } catch (err) {
        console.error("Error fetching schedule:", err);
        document.getElementById("btngenera").innerHTML = "Genera Turni";
    }

}
result = {}
function stampa(data) {
    document.getElementById("generated").innerHTML = "";
    result = {};
    for (const [worker, info] of Object.entries(data.assignments)) {
        result[worker] = [];
        info.tasks.forEach(t => {
            shift = t.shift;
            ruolo = shift.split("-")[0];
            giornoturno = shift.split("-")[1];
            giorno = giornoturno.split("/")[0];
            turno = giornoturno.split("/")[1];
            ore = t.hours;
            result[worker].push({ ruolo, giorno, turno, ore });
        });
        stampaTurni(worker, result[worker]);
    }
}

function stampaTurni(worker, dati) {
    div = document.getElementById("generated");
    let text = `<h3>Turni per ${worker}:</h3>`;
    let oreTotali = 0;
    for (const entry of dati) {
        text += `<p>Ruolo: ${entry.ruolo}, Giorno: ${entry.giorno}, Turno: ${entry.turno}, Ore: ${entry.ore}</p>`;
        oreTotali += entry.ore;
    }
    text += `<p><strong>Ore totali: ${oreTotali}</strong></p><hr>`;
    div.innerHTML += text;
}

function closegenerati() {
    document.getElementById("datiGenerati").style.display = "none";
}

function exportScheduleToCSV() {
  const workers = Object.keys(result);

  const allShifts = new Set();
  for (const worker of workers) {
    for (const task of result[worker]) {
      const shiftKey = `${task.giorno}|${task.turno}`; // separatore sicuro
      allShifts.add(shiftKey);
    }
  }
  const shifts = Array.from(allShifts);

  const header = ["Giorno", "Turno", ...workers];

  const rows = shifts.map(shiftKey => {
    const [giorno, turno] = shiftKey.split("|");
    const row = [giorno, turno];

    for (const worker of workers) {
      const match = result[worker].find(
        t => t.giorno === giorno && t.turno === turno
      );
      row.push(match ? `${match.ruolo} (${match.ore}h)` : "");
    }
    return row;
  });

  const totals = workers.map(worker =>
    result[worker].reduce((sum, t) => sum + (t.ore || 0), 0)
  );

  const totalRow = ["Totale", "", ...totals.map(h => `${h}h`)];

  const csvMatrix = [header, ...rows, totalRow];

  const csvContent =
    "\uFEFF" + csvMatrix.map(r => r.map(v => `"${v}"`).join(",")).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "turni.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


function creaTuttoFare() {
  const nome = "Turno Scoperto";
  const ruoli = roles.map(r => r.nome);
  const giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  const disponibilita = {};
  giorni.forEach(giorno => {
    disponibilita[giorno] = { pranzo: true, cena: true };
  });
  const maxOre = 999;
  return new Lavoratore(nome, ruoli, disponibilita, maxOre);
}
