workers_id = []
max_hours_per_worker = {}
shifts = []
hoursPerShift = {}
availability = {}
forbiddenSet = []

// Helper: ottieni orario inizio/fine
function getTurnTimeRange(turnName) {
    const t = turnTypes.find(x => x.name === turnName);
    if(!t) return null;
    
    const toMin = (str) => {
        const [h, m] = str.split(":").map(Number);
        return h * 60 + m;
    };
    
    let start = toMin(t.start);
    let end = toMin(t.end);
    
    if (end < start) end += 24 * 60; 

    return { start, end };
}

function getWorkers() {
    for (const w of workers) {
        workers_id.push(w.nome);
        max_hours_per_worker[w.nome] = w.maxOre;
    }
}

function getShifts() {
    for (const r of roles) {
        i = 0;
        persone_qualificate = [];
        ruolo = r.nome.toLowerCase();
        
        for (const w of workers) {
            const wRuoli = w.ruoli.map(s => s.toLowerCase());
            if (wRuoli.includes(ruolo)) {
                persone_qualificate.push(w.nome);
            }
        }
        
        for (const s of r.shifts) {
            s.id = s.giorno + "/" + s.turno; 
            const hrs = getTurnHours(s.turno);

            for (let j = 0; j < s.persone; j++) {
                const shiftKey = r.nome + "-" + s.id + "-" + j.toString();
                shifts.push(shiftKey);
                hoursPerShift[shiftKey] = hrs;

                for (const p of workers) {
                    const userAvail = p.disponibilita[s.giorno] && p.disponibilita[s.giorno][s.turno];
                    
                    if (persone_qualificate.includes(p.nome) && userAvail) {
                        availability[p.nome + "," + shiftKey] = 1;
                    } else {
                        availability[p.nome + "," + shiftKey] = 0;
                    }
                }
            }
            i += 1;
        }
    }
}

function getForbiddenSet() {
    const allShiftInstances = [];

    roles.forEach(r => {
        r.shifts.forEach(s => {
            const timeRange = getTurnTimeRange(s.turno);
            if(!timeRange) return;

            for(let j=0; j<s.persone; j++) {
                const uniqueId = `${r.nome}-${s.giorno}/${s.turno}-${j}`;
                allShiftInstances.push({
                    id: uniqueId,
                    day: s.giorno,
                    start: timeRange.start,
                    end: timeRange.end
                });
            }
        });
    });

    for(let i=0; i<allShiftInstances.length; i++) {
        for(let k=i+1; k<allShiftInstances.length; k++) {
            const s1 = allShiftInstances[i];
            const s2 = allShiftInstances[k];

            if(s1.day === s2.day) {
                if(s1.start < s2.end && s2.start < s1.end) {
                    forbiddenSet.push([s1.id, s2.id]);
                }
            }
        }
    }
}

function clearSets() {
    workers_id = [];
    max_hours_per_worker = {};
    shifts = [];
    hoursPerShift = {};
    availability = {};
    forbiddenSet = [];
}

function generaSets() {
    clearSets();
    getWorkers();
    getShifts();
    getForbiddenSet();
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
            alert("Impossibile generare i turni. Personale insufficiente o vincoli troppo stretti.");
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

let result = {};

function stampa(data) {
    document.getElementById("generated").innerHTML = "";
    result = {};
    
    for (const [worker, info] of Object.entries(data.assignments)) {
        result[worker] = [];
        info.tasks.forEach(t => {
            const raw = t.shift;
            const parts = raw.split("-");
            const index = parts.pop();
            const dayTurn = parts.pop(); 
            const role = parts.join("-"); 
            
            const [giorno, turno] = dayTurn.split("/");
            
            result[worker].push({ role, giorno, turno, ore: t.hours });
        });
        stampaTurni(worker, result[worker]);
    }
}

function stampaTurni(worker, dati) {
    div = document.getElementById("generated");
    let text = `<h3>Turni per ${worker}:</h3>`;
    let oreTotali = 0;
    
    const daysOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
    dati.sort((a,b) => daysOrder.indexOf(a.giorno) - daysOrder.indexOf(b.giorno));

    for (const entry of dati) {
        text += `<p><strong>${entry.giorno}</strong> (${entry.turno}): ${entry.role} <small>(${entry.ore}h)</small></p>`;
        oreTotali += entry.ore;
    }
    text += `<p><strong>Ore totali: ${oreTotali}</strong></p><hr>`;
    div.innerHTML += text;
}

function closegenerati() {
    document.getElementById("datiGenerati").style.display = "none";
}

// ==========================================
// NEW EXCEL EXPORT (Replacing CSV)
// ==========================================
function exportScheduleToExcel() {
  if (typeof XLSX === 'undefined') {
      alert("Libreria Excel non caricata correttamente.");
      return;
  }

  const workersList = Object.keys(result);
  const dayOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  
  // Data Structure for the Sheet
  // Row 1: Headers
  // Columns: Day/Turn, ...Workers, Total Day
  
  const ws_data = [];
  
  // 1. HEADER ROW
  const headerRow = [
      { v: "Giorno / Turno", s: { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } }, border: { bottom: { style: "thin" } } } }
  ];
  
  workersList.forEach(w => {
      headerRow.push({ v: w.toUpperCase(), s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "E0E0E0" } }, border: { bottom: { style: "thin" }, left: { style: "thin" } } } });
  });
  
  // Add Header for Daily Totals
  headerRow.push({ v: "TOTALE ORE", s: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "444444" } }, alignment: { horizontal: "center" } } });
  
  ws_data.push(headerRow);

  // Initialize sums for Weekly Totals per Worker
  const weeklyTotalsWorker = {};
  workersList.forEach(w => weeklyTotalsWorker[w] = 0);

  // 2. DATA ROWS
  dayOrder.forEach(giorno => {
      // Create a section header or just group by borders? Let's iterate turns
      turnTypes.forEach((tt, idx) => {
          let dayTotalHours = 0;
          
          const row = [];
          
          // First Column: Day - Turn
          // Visual separation: Bold day name only on first turn
          const label = `${giorno} - ${tt.name}`;
          const isFirstTurn = (idx === 0);
          
          row.push({ 
              v: label, 
              s: { 
                  font: { bold: isFirstTurn }, 
                  fill: { fgColor: { rgb: isFirstTurn ? "F9F9F9" : "FFFFFF" } },
                  border: { top: { style: isFirstTurn ? "medium" : "thin" } }
              } 
          });

          // Worker Columns
          workersList.forEach(w => {
              const task = result[w].find(t => t.giorno === giorno && t.turno === tt.name);
              let cellVal = "";
              let cellStyle = { alignment: { horizontal: "center" }, border: { top: { style: isFirstTurn ? "medium" : "thin" }, left: { style: "thin" } } };
              
              if (task) {
                  cellVal = `${task.role}`; // Just Role Name
                  // Accumulate totals
                  dayTotalHours += task.ore;
                  weeklyTotalsWorker[w] += task.ore;
                  
                  // Highlight assigned cells
                  cellStyle.fill = { fgColor: { rgb: "E6FFE6" } }; // Light Green
              }
              
              row.push({ v: cellVal, s: cellStyle });
          });

          // Last Column: Total for this turn row (Staff hours)
          // "Total hours of the day" usually means per row sum or sum of all turns in that day.
          // Let's put the sum for this specific turn row here.
          row.push({ 
              v: dayTotalHours > 0 ? dayTotalHours : "", 
              t: 'n',
              s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "F0F0F0" } } } 
          });

          ws_data.push(row);
      });
      
      // OPTIONAL: Add a "Daily Total" row separator if needed, but PDF implies compact rows.
      // We will stick to the side column summing the specific turn hours.
  });

  // 3. FOOTER ROW: Grand Totals per Worker
  const totalRow = [
      { v: "TOTALE SETTIMANALE", s: { font: { bold: true }, fill: { fgColor: { rgb: "444444" } }, font: { color: { rgb: "FFFFFF" } } } }
  ];
  
  let grandTotalWeek = 0;

  workersList.forEach(w => {
      const tot = weeklyTotalsWorker[w];
      grandTotalWeek += tot;
      totalRow.push({ 
          v: tot, 
          t: 'n',
          s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "DDDDDD" } }, border: { top: { style: "double" } } } 
      });
  });

  // Bottom Right Corner: Total Hours of the whole week for everyone
  totalRow.push({ 
      v: grandTotalWeek, 
      t: 'n',
      s: { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "FFD700" } }, border: { top: { style: "double" } } } 
  });

  ws_data.push(totalRow);

  // GENERATE WORKBOOK
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Set column widths
  const wscols = [
      { wch: 25 }, // Day/Turn column
      ...workersList.map(() => ({ wch: 15 })), // Worker columns
      { wch: 15 } // Total column
  ];
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Turni");

  // Export
  XLSX.writeFile(wb, "turni_ristorante.xlsx");
}