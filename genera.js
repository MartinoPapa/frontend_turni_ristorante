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
            alert("Impossibile generare i turni. Errore generico.");
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
    const div = document.getElementById("generated");
    div.innerHTML = "";
    result = {};
    
    let uncoveredData = null;

    // Process assignments
    for (const [worker, info] of Object.entries(data.assignments)) {
        // Parse tasks
        const parsedTasks = info.tasks.map(t => {
            const raw = t.shift;
            const parts = raw.split("-");
            const index = parts.pop();
            const dayTurn = parts.pop(); 
            const role = parts.join("-"); 
            
            const [giorno, turno] = dayTurn.split("/");
            return { role, giorno, turno, ore: t.hours };
        });

        if (worker === "_UNCOVERED_") {
            uncoveredData = parsedTasks;
        } else {
            result[worker] = parsedTasks;
        }
    }

    // 1. PRINT UNCOVERED FIRST (If any)
    if (uncoveredData && uncoveredData.length > 0) {
        // Group by Day+Turn+Role to calculate counts
        const aggregated = {};
        uncoveredData.forEach(u => {
            const key = `${u.giorno}|${u.turno}|${u.role}`;
            if(!aggregated[key]) aggregated[key] = 0;
            aggregated[key]++;
        });

        // Convert back to array for sorting/display
        const displayList = Object.entries(aggregated).map(([key, count]) => {
            const [giorno, turno, role] = key.split("|");
            return { giorno, turno, role, count };
        });
        
        // Sort
        const daysOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
        displayList.sort((a,b) => {
             const dayDiff = daysOrder.indexOf(a.giorno) - daysOrder.indexOf(b.giorno);
             if(dayDiff !== 0) return dayDiff;
             return a.turno.localeCompare(b.turno);
        });

        let alertHtml = `<div class="uncovered-alert">
            <h3>⚠️ ATTENZIONE</h3>
            <p>I seguenti turni risultano al momento scoperti:</p>
            <div class="uncovered-grid">`;
        
        for (const u of displayList) {
            alertHtml += `<div class="uncovered-item"><span class="icon">❌</span> ${u.giorno} | ${u.turno} | ${u.role} <span class="badge">${u.count} person${u.count == 1 ? "a" : "e"}</span></div>`;
        }
        alertHtml += `</div></div>`;
        div.innerHTML += alertHtml;
        
        // Add to result for Excel export
        result["⚠ NON COPERTI"] = uncoveredData;
    }

    // 2. PRINT REAL WORKERS
    for (const worker of Object.keys(result)) {
        if (worker === "⚠ NON COPERTI") continue; 
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
// EXCEL EXPORT (IMPROVED)
// ==========================================
function exportScheduleToExcel() {
  if (typeof XLSX === 'undefined') {
      alert("Libreria Excel non caricata correttamente.");
      return;
  }

  const workersList = Object.keys(result);
  // Ensure "NON COPERTI" is last
  workersList.sort((a,b) => {
      if(a === "⚠ NON COPERTI") return 1;
      if(b === "⚠ NON COPERTI") return -1;
      return 0;
  });

  const dayOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  
  const ws_data = [];
  
  // HEADER
  const headerRow = [
      { v: "Giorno / Turno", s: { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } }, border: { bottom: { style: "thin" } } } }
  ];
  
  workersList.forEach(w => {
      const isUncovered = (w === "⚠ NON COPERTI");
      headerRow.push({ 
          v: w.toUpperCase(), 
          s: { 
              font: { bold: true, color: { rgb: isUncovered ? "FF0000" : "000000" } }, 
              alignment: { horizontal: "center" }, 
              fill: { fgColor: { rgb: "E0E0E0" } }, 
              border: { bottom: { style: "thin" }, left: { style: "thin" } } 
          } 
      });
  });
  
  headerRow.push({ v: "TOTALE ORE", s: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "444444" } }, alignment: { horizontal: "center" } } });
  
  ws_data.push(headerRow);

  const weeklyTotalsWorker = {};
  workersList.forEach(w => weeklyTotalsWorker[w] = 0);

  // DATA ROWS
  dayOrder.forEach(giorno => {
      // Keep track of daily totals per person
      const dailyTotalsWorker = {};
      workersList.forEach(w => dailyTotalsWorker[w] = 0);
      let dailyGrandTotal = 0;

      // 1. Process Turns
      turnTypes.forEach((tt, idx) => {
          let rowTotalHours = 0;
          const row = [];
          
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

          workersList.forEach(w => {
              const task = result[w].find(t => t.giorno === giorno && t.turno === tt.name);
              let cellVal = "";
              let cellStyle = { alignment: { horizontal: "center" }, border: { top: { style: isFirstTurn ? "medium" : "thin" }, left: { style: "thin" } } };
              
              if (task) {
                  if (w === "⚠ NON COPERTI") {
                      const allTasksForCell = result[w].filter(t => t.giorno === giorno && t.turno === tt.name);
                      const roleCounts = {};
                      allTasksForCell.forEach(t => roleCounts[t.role] = (roleCounts[t.role] || 0) + 1);
                      const parts = Object.entries(roleCounts).map(([r, c]) => `${r} (${c})`);
                      cellVal = parts.join(", ");
                      cellStyle.fill = { fgColor: { rgb: "FFCCCC" } };
                      cellStyle.font = { color: { rgb: "CC0000" }, bold: true };
                  } else {
                      cellVal = `${task.role}`; 
                      rowTotalHours += task.ore;
                      weeklyTotalsWorker[w] += task.ore;
                      dailyTotalsWorker[w] += task.ore;
                      dailyGrandTotal += task.ore;
                      cellStyle.fill = { fgColor: { rgb: "E6FFE6" } }; 
                  }
              }
              row.push({ v: cellVal, s: cellStyle });
          });

          // Sum of the row (shift specific)
          row.push({ 
              v: rowTotalHours > 0 ? rowTotalHours : "", 
              t: 'n',
              s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "F0F0F0" } } } 
          });

          ws_data.push(row);
      });

      // 2. Add Daily Summary Row
      const summaryRow = [];
      summaryRow.push({ 
          v: `TOTALE ${giorno.toUpperCase()}`, 
          s: { font: { bold: true, italic: true }, fill: { fgColor: { rgb: "D9D9D9" } }, border: { top: { style: "thin" } } } 
      });

      workersList.forEach(w => {
           if(w === "⚠ NON COPERTI") {
               summaryRow.push({ v: "", s: { fill: { fgColor: { rgb: "D9D9D9" } } } });
           } else {
               const dayTot = dailyTotalsWorker[w];
               summaryRow.push({ 
                   v: dayTot > 0 ? dayTot : "", 
                   t: 'n', 
                   s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "D9D9D9" } } } 
               });
           }
      });

      // Daily Grand Total
      summaryRow.push({ 
          v: dailyGrandTotal, 
          t: 'n', 
          s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "BFBFBF" } } } 
      });

      ws_data.push(summaryRow);
      // Empty spacer row? Maybe not needed for compactness.
  });

  // FOOTER ROW (Weekly Totals)
  const totalRow = [
      { v: "TOTALE SETTIMANALE", s: { font: { bold: true }, fill: { fgColor: { rgb: "444444" } }, font: { color: { rgb: "FFFFFF" } } } }
  ];
  
  let grandTotalWeek = 0;

  workersList.forEach(w => {
      if (w === "⚠ NON COPERTI") {
          totalRow.push({ v: "", s: { fill: { fgColor: { rgb: "DDDDDD" } } } });
      } else {
        const tot = weeklyTotalsWorker[w];
        grandTotalWeek += tot;
        totalRow.push({ 
            v: tot, 
            t: 'n',
            s: { font: { bold: true }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "DDDDDD" } }, border: { top: { style: "double" } } } 
        });
      }
  });

  totalRow.push({ 
      v: grandTotalWeek, 
      t: 'n',
      s: { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "FFD700" } }, border: { top: { style: "double" } } } 
  });

  ws_data.push(totalRow);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  const wscols = [
      { wch: 25 }, 
      ...workersList.map(() => ({ wch: 15 })), 
      { wch: 15 } 
  ];
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Turni");
  XLSX.writeFile(wb, "turni_ristorante.xlsx");
}