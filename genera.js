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
        "key": psw, // INVIO DELLA PASSWORD (SICUREZZA MANTENUTA)
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
            const errData = await response.json().catch(() => ({}));
            const msg = errData.error || "Impossibile generare i turni. Errore generico.";
            alert(msg);
            document.getElementById("btngenera").innerHTML = "Genera Turni";
            return;
        }

        let data = await response.json();
        stampa(data);
        document.getElementById("datiGenerati").style.display = "flex";
        document.getElementById("btngenera").innerHTML = "Genera Turni";

    } catch (err) {
        console.error("Error fetching schedule:", err);
        alert("Errore di connessione al server.");
        document.getElementById("btngenera").innerHTML = "Genera Turni";
    }
}

let result = {};

// ==========================================
// STAMPA (LAYOUT GRIGLIA RIPRISTINATO)
// ==========================================
function stampa(data) {
    const div = document.getElementById("generated");
    div.innerHTML = "";
    result = {};
    
    let uncoveredData = null;

    // Process assignments
    for (const [worker, info] of Object.entries(data.assignments)) {
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

    // 1. GESTIONE NON COPERTI
    if (uncoveredData && uncoveredData.length > 0) {
        const aggregated = {};
        uncoveredData.forEach(u => {
            const key = `${u.giorno}|${u.turno}|${u.role}`;
            if(!aggregated[key]) aggregated[key] = 0;
            aggregated[key]++;
        });

        const displayList = Object.entries(aggregated).map(([key, count]) => {
            const [giorno, turno, role] = key.split("|");
            return { giorno, turno, role, count };
        });
        
        const daysOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
        displayList.sort((a,b) => {
             const dayDiff = daysOrder.indexOf(a.giorno) - daysOrder.indexOf(b.giorno);
             if(dayDiff !== 0) return dayDiff;
             return a.turno.localeCompare(b.turno);
        });

        let alertHtml = `<div class="uncovered-alert">
            <h3>Personale mancante:</h3>
            <div class="uncovered-grid">`;
        
        for (const u of displayList) {
            alertHtml += `<div class="uncovered-item">
                <span class="badg-day">${u.giorno}</span>
                <span class="badg-turn">${u.turno}</span>
                <span class="badg-role">${u.role}</span>
                <span class="badg-count">${u.count} Mancant${u.count === 1 ? 'e' : 'i'}</span>
            </div>`;
        }
        alertHtml += `</div></div>`;
        div.innerHTML += alertHtml;
        result["⚠ NON COPERTI"] = uncoveredData;
    }

    // 2. STAMPA LAVORATORI (LAYOUT A GRIGLIA)
    const daysOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
    
    for (const worker of Object.keys(result)) {
        if (worker === "⚠ NON COPERTI") continue;
        
        let workerTasks = result[worker];
        let totOre = workerTasks.reduce((acc, curr) => acc + curr.ore, 0);

        // Creiamo la card del lavoratore
        let cardHtml = `
        <div class="worker-report-card">
            <div class="worker-header">
                <h3>${worker}</h3>
                <span class="total-badge">${totOre} ore</span>
            </div>
            <div class="week-grid">`;

        // Iteriamo i giorni per creare le caselle
        daysOrder.forEach(day => {
            const dailyTasks = workerTasks.filter(t => t.giorno === day);
            dailyTasks.sort((a,b) => a.turno.localeCompare(b.turno));

            let dayContent = "";
            if (dailyTasks.length > 0) {
                dailyTasks.forEach(t => {
                    dayContent += `<div class="shift-chip">
                        <span class="s-turn">${t.turno}</span>
                        <span class="s-role">${t.role}</span>  
                        <span class="s-hours">${turnTypes.find(tt => tt.name === t.turno).start} - ${turnTypes.find(tt => tt.name === t.turno).end}</span>
                    </div>`;
                });
                cardHtml += `<div class="day-box active">
                    <div class="day-name">${day}</div>
                    <div class="day-shifts">${dayContent}</div>
                </div>`;
            } else {
                cardHtml += `<div class="day-box empty">
                    <div class="day-name">${day}</div>
                    <div class="day-shifts">-</div>
                </div>`;
            }
        });

        cardHtml += `</div></div>`; // Chiusura week-grid e card
        div.innerHTML += cardHtml;
    }
}

function closegenerati() {
    document.getElementById("datiGenerati").style.display = "none";
}

// ==========================================
// EXCEL EXPORT (DESIGN PULITO + TOTALI COORDINATI)
// ==========================================
function exportScheduleToExcel() {
  if (typeof XLSX === 'undefined') {
      alert("Errore: Libreria SheetJS (XLSX) non caricata.");
      return;
  }

  // --- HELPER: Indici e Formati ---
  function getColLetter(colIndex) {
      let letter = "";
      colIndex++; 
      while (colIndex > 0) {
          let mod = (colIndex - 1) % 26;
          letter = String.fromCharCode(65 + mod) + letter;
          colIndex = Math.floor((colIndex - mod) / 26);
      }
      return letter;
  }

  function getCellRef(rowIndex, colIndex) {
      return getColLetter(colIndex) + (rowIndex + 1);
  }

  function timeToExcelSerial(timeStr) {
      if (!timeStr || typeof timeStr !== 'string') return 0;
      const [h, m] = timeStr.split(":").map(Number);
      return (h / 24) + (m / 1440);
  }

  const getTimes = (turnName) => {
      const tt = turnTypes.find(x => x.name === turnName);
      return tt ? { start: tt.start, end: tt.end } : { start: "00:00", end: "00:00" };
  };

  // --- STILI (Palette Colori Migliorata) ---
  const styleBorder = { top: {style:"thin"}, bottom: {style:"thin"}, left: {style:"thin"}, right: {style:"thin"} };
  
  // Colore condiviso per i totali (Grigio Medio)
  const TOTAL_COLOR = { rgb: "D9D9D9" }; 
  
  const styles = {
      // Header: Blu Scuro, Testo Bianco (Molto leggibile)
      header: { 
          font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } }, 
          fill: { fgColor: { rgb: "44546A" } }, // Dark Slate Blue
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center" } 
      },
      // Giorno: Grigio/Blu molto chiaro
      dayCol: { 
          font: { bold: true, sz: 11 }, 
          fill: { fgColor: { rgb: "E7E6E6" } }, 
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center", wrapText: true } 
      },
      // Ruolo: Azzurro Pastello
      role: { 
          font: { bold: true, sz: 10, color: { rgb: "000000" } }, 
          fill: { fgColor: { rgb: "DDEBF7" } }, 
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center" } 
      }, 
      // Orario: Bianco pulito con formato ora
      time: { 
          numFmt: "hh:mm", 
          font: { sz: 10 }, 
          fill: { fgColor: { rgb: "FFFFFF" } }, 
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center" } 
      },
      // Riposo: Giallo chiaro neutro
      rest: { 
          font: { italic: true, color: { rgb: "555555" } }, 
          fill: { fgColor: { rgb: "FFF2CC" } }, 
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center" } 
      },
      // Scoperti: Rosso chiaro
      uncovered: { 
          font: { bold: true, color: { rgb: "9C0006" } }, // Dark Red Text
          fill: { fgColor: { rgb: "FFC7CE" } }, // Light Red Fill
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center" } 
      },
      // Totale Generico (Cella vuota nella colonna totale)
      totalColEmpty: {
          fill: { fgColor: TOTAL_COLOR },
          border: styleBorder
      },
      // Riga/Colonna Totale (Numeri)
      total: { 
          font: { bold: true }, 
          fill: { fgColor: TOTAL_COLOR }, 
          border: styleBorder, 
          alignment: { horizontal: "center", vertical: "center" }, 
          numFmt: "0.00" 
      },
      // Totale Settimanale (Footer) - Leggermente più scuro per stacco visivo
      totalFooter: { 
          font: { bold: true, color: { rgb: "000000" } }, 
          fill: { fgColor: TOTAL_COLOR }, // Mantiene lo stesso colore come richiesto
          border: { top: {style:"medium"}, bottom: {style:"medium"}, left: {style:"thin"}, right: {style:"thin"} }, 
          alignment: { horizontal: "center", vertical: "center" }, 
          numFmt: "0.00" 
      },
      // Incrocio Totale (Angolo in basso a destra)
      grandTotal: { 
          font: { bold: true, sz: 12, color: { rgb: "000000" } }, 
          fill: { fgColor: { rgb: "BFBFBF" } }, // Appena più scuro per l'angolo finale
          border: { top: {style:"medium"}, bottom: {style:"medium"}, left: {style:"thin"}, right: {style:"thin"} }, 
          alignment: { horizontal: "center", vertical: "center" }, 
          numFmt: "0.00" 
      }
  };

  // --- PREPARAZIONE DATI ---
  const realWorkers = Object.keys(result).filter(k => 
      k && k !== "⚠ NON COPERTI" && k !== "undefined" && k !== "null" && String(k).trim().length > 0
  ).sort();

  const uncoveredKey = "⚠ NON COPERTI";
  const hasUncovered = result[uncoveredKey] && Array.isArray(result[uncoveredKey]) && result[uncoveredKey].length > 0;

  // Mappa Colonne
  const colMap = { "GIORNO": 0 };
  let colIndex = 1;
  realWorkers.forEach(w => { colMap[w] = colIndex++; });
  if (hasUncovered) { colMap["SCOPERTI"] = colIndex++; }
  colMap["TOTALE"] = colIndex;

  const totalCols = colIndex + 1;
  const ws_data = []; 
  const merges = []; 

  // Helper creazione righe: Applica automaticamente lo stile Totale all'ultima colonna
  const createEmptyRow = () => {
      const row = [];
      for(let i=0; i<totalCols; i++) {
          // Se è l'ultima colonna, usa lo sfondo del totale (anche se vuota)
          if (i === colMap["TOTALE"]) {
              row.push({ v: "", s: styles.totalColEmpty });
          } else {
              row.push({ v: "", s: styleBorder });
          }
      }
      return row;
  };

  // --- HEADER ---
  const headerRow = [];
  // Creazione manuale header per gestire stili diversi
  for(let i=0; i<totalCols; i++) headerRow.push({ v: "", s: styles.header });
  
  Object.keys(colMap).forEach(key => {
      headerRow[colMap[key]] = { v: key, s: styles.header };
  });
  // Sovrascrivi stile header ultima colonna per coerenza o lascialo scuro? Lasciamolo scuro (header style)
  ws_data.push(headerRow);

  const workerDailyTotalRefs = {}; 
  realWorkers.forEach(w => workerDailyTotalRefs[w] = []);
  const grandDailyTotalRefs = [];

  // --- LOOP GIORNI ---
  const days = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

  days.forEach(giorno => {
      // 1. Dati Scoperti
      let uncoveredGrouped = [];
      if (hasUncovered) {
          const raw = (result[uncoveredKey] || []).filter(t => t.giorno === giorno);
          const map = {};
          raw.forEach(u => {
              const k = u.turno + "|" + u.role;
              if(!map[k]) map[k] = { ...u, count: 0 };
              map[k].count++;
          });
          uncoveredGrouped = Object.values(map).sort((a,b) => getTimes(a.turno).start.localeCompare(getTimes(b.turno).start));
      }

      // 2. Calcolo Altezza
      let maxWorkerShifts = 0;
      realWorkers.forEach(w => {
          const count = (result[w] || []).filter(t => t.giorno === giorno).length;
          if (count > maxWorkerShifts) maxWorkerShifts = count;
      });

      const rowsForWorkers = maxWorkerShifts * 3;
      const rowsForUncovered = uncoveredGrouped.length;
      let rowsNeeded = Math.max(rowsForWorkers, rowsForUncovered);
      if (rowsNeeded === 0) rowsNeeded = 1;

      const startRow = ws_data.length;

      // 3. Allocazione Righe
      for(let i=0; i<rowsNeeded; i++) ws_data.push(createEmptyRow());

      // 4. Colonna Giorno
      ws_data[startRow][0] = { v: giorno.toUpperCase(), s: styles.dayCol };
      merges.push({ s: {r: startRow, c: 0}, e: {r: startRow + rowsNeeded - 1, c: 0} });

      const rowDailyTotalRefs = []; 

      // 5. Lavoratori
      realWorkers.forEach(w => {
          const cIdx = colMap[w];
          const tasks = (result[w] || []).filter(t => t.giorno === giorno);
          tasks.sort((a,b) => getTimes(a.turno).start.localeCompare(getTimes(b.turno).start));

          const timePairsRefs = [];

          if (tasks.length === 0) {
              ws_data[startRow][cIdx] = { v: "Riposo", s: styles.rest };
              for(let r=1; r<rowsNeeded; r++) ws_data[startRow + r][cIdx].s = styles.rest;
              merges.push({ s: {r: startRow, c: cIdx}, e: {r: startRow + rowsNeeded - 1, c: cIdx} });
          } else {
              tasks.forEach((task, index) => {
                  const rBase = startRow + (index * 3);
                  const times = getTimes(task.turno);

                  ws_data[rBase][cIdx] = { v: task.role, s: styles.role };
                  
                  ws_data[rBase+1][cIdx] = { 
                      v: timeToExcelSerial(times.start), t: 'n', s: styles.time 
                  };
                  ws_data[rBase+2][cIdx] = { 
                      v: timeToExcelSerial(times.end), t: 'n', s: styles.time 
                  };

                  timePairsRefs.push({
                      start: getCellRef(rBase+1, cIdx),
                      end: getCellRef(rBase+2, cIdx)
                  });
              });
          }
          
          if(!this.dailyFormulasMap) this.dailyFormulasMap = {};
          this.dailyFormulasMap[w] = timePairsRefs;
      });

      // 6. Scoperti
      if (hasUncovered && uncoveredGrouped.length > 0) {
          const cIdx = colMap["SCOPERTI"];
          uncoveredGrouped.forEach((item, index) => {
              const rBase = startRow + index;
              const label = `${item.turno} | ${item.role} | ${item.count}`;
              ws_data[rBase][cIdx] = { v: label, s: styles.uncovered };
          });
      }

      // 7. RIGA RIEPILOGO GIORNALIERO
      // Creiamo una riga dove TUTTE le celle hanno lo stile 'total' per continuità visiva
      const summaryRow = [];
      for(let i=0; i<totalCols; i++) summaryRow.push({ v: "", s: styles.total });
      
      const summaryRowIndex = ws_data.length;

      summaryRow[0] = { v: "TOT. " + giorno.substr(0,3).toUpperCase(), s: styles.total };

      realWorkers.forEach(w => {
          const cIdx = colMap[w];
          const timePairs = this.dailyFormulasMap[w];
          
          if (timePairs && timePairs.length > 0) {
              const parts = timePairs.map(p => `MOD(${p.end}-${p.start},1)`);
              const formula = `(${parts.join("+")})*24`;
              
              summaryRow[cIdx] = { t: 'n', f: formula, s: styles.total };
              workerDailyTotalRefs[w].push(getCellRef(summaryRowIndex, cIdx));
              rowDailyTotalRefs.push(getCellRef(summaryRowIndex, cIdx));
          } else {
              summaryRow[cIdx] = { v: "-", s: styles.total };
          }
      });

      if (hasUncovered) {
          summaryRow[colMap["SCOPERTI"]] = { v: "-", s: styles.total };
      }

      // Totale Generale Giorno (Ultima colonna)
      const totalColIdx = colMap["TOTALE"];
      if (rowDailyTotalRefs.length > 0) {
          summaryRow[totalColIdx] = {
              t: 'n',
              f: `SUM(${rowDailyTotalRefs.join(",")})`,
              s: styles.total // Stesso colore del resto della riga
          };
          grandDailyTotalRefs.push(getCellRef(summaryRowIndex, totalColIdx));
      } else {
          summaryRow[totalColIdx] = { v: 0, s: styles.total };
      }

      ws_data.push(summaryRow);
      this.dailyFormulasMap = {}; 
  });

  // --- FOOTER SETTIMANALE ---
  const footerRow = [];
  for(let i=0; i<totalCols; i++) footerRow.push({ v: "", s: styles.totalFooter });

  footerRow[0] = { v: "TOTALE", s: styles.totalFooter };

  realWorkers.forEach(w => {
      const cIdx = colMap[w];
      const refs = workerDailyTotalRefs[w];
      if (refs.length > 0) {
          footerRow[cIdx] = { t: 'n', f: `SUM(${refs.join(",")})`, s: styles.totalFooter };
      } else {
          footerRow[cIdx] = { v: 0, t: 'n', s: styles.totalFooter };
      }
  });

  if (grandDailyTotalRefs.length > 0) {
      footerRow[colMap["TOTALE"]] = {
          t: 'n',
          f: `SUM(${grandDailyTotalRefs.join(",")})`,
          s: styles.grandTotal // Unico punto diverso (angolo)
      };
  } else {
      footerRow[colMap["TOTALE"]] = { v: 0, s: styles.grandTotal };
  }

  ws_data.push(footerRow);

  // --- EXPORT ---
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  ws['!merges'] = merges;
  
  const wscols = [];
  wscols[0] = { wch: 15 };
  realWorkers.forEach((_, i) => wscols[colMap[_]] = { wch: 22 });
  if (hasUncovered) wscols[colMap["SCOPERTI"]] = { wch: 35 };
  wscols[colMap["TOTALE"]] = { wch: 15 };
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Turni");
  XLSX.writeFile(wb, "turni_ristorante.xlsx");
}