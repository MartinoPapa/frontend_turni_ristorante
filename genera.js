/*
constructor(nome, ruoli, disponibilita, maxOre) {
    this.nome = nome;
    this.ruoli = ruoli;
    this.disponibilita = disponibilita;
    this.maxOre = maxOre;
    this.index = worker_index++;
    this.article = null;
  }

    constructor(nome, shifts = []) {
    this.nome = nome;
    this.shifts = shifts;
    this.index = role_index++;
    this.article = null;
  }

  */

function getWorkers() {
    for (const w of workers) {
        workers_id.push(w.index.toString());
        max_hours_per_worker['"' + w.index.toString() + '"'] = w.maxOre;
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
                persone_qualificate.push(w.index.toString());
            }
        }
        // for each shift in the role
        for (const s of r.shifts) {
            s.i = i;
            // need one shift for each person required
            for (let j = 0; j < s.persone; j++) {
                shifts.push(r.nome + "-" + i.toString() + "-" + j.toString()); // roleIndex-shiftIndex-shiftPersonIndex
                hoursPerShift['"' + r.nome + "-" + i.toString() + "-" + j.toString() + '"'] = s.ore;
                for (const p of workers) {
                    // se qualificato e disponibile 1 altrimenti 0
                    if (persone_qualificate.includes(p.index.toString()) && p.disponibilita[s.giorno][s.turno.toLowerCase()]) {
                        availability['"' + p.index.toString() + "," + r.nome + "-" + i.toString() + "-" + j.toString() + '"'] = 1;
                    } else {
                        availability['"' + p.index.toString() + "," + r.nome + "-" + i.toString() + "-" + j.toString() + '"'] = 0;
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
        console.log("Giorno: " + g.giorno + " Turno: " + g.turno);
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
    printSets();
}

async function getSchedule() {
    generaSets()
    try {
        const response = await fetch("https://backend-turni-ristorante.onrender.com/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workers: workers_id, shifts, H: hoursPerShift, M: max_hours_per_worker, avail: availability, forbidden_pairs: forbiddenSet })
        });

        const data = await response.json();
        console.log("Schedule received:", data);

    } catch (err) {
        console.error("Error fetching schedule:", err);
    }
}

// cambiare 0-0 con LunedìPranzo-0