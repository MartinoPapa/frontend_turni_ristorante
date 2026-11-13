workers_id = []
max_hours_per_worker = {}
shifts = []
hoursPerShift = {}
availability = {}
forbiddenSet = []

// Helper: ottieni orario inizio/fine
function getTurnTimeRange(turnName) {
    const t = turnTypes.find(x => x.name === turnName);
    if (!t) return null;

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
            if (!timeRange) return;

            for (let j = 0; j < s.persone; j++) {
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

    for (let i = 0; i < allShiftInstances.length; i++) {
        for (let k = i + 1; k < allShiftInstances.length; k++) {
            const s1 = allShiftInstances[i];
            const s2 = allShiftInstances[k];

            if (s1.day === s2.day) {
                if (s1.start < s2.end && s2.start < s1.end) {
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
    if (typeof isDemo !== "undefined" && isDemo) {
        openDemoModal("generate");
        return;
    }

    // Verifica che l'utente sia autenticato prima di procedere
    if (!session || !session.access_token) {
        alert("Sessione scaduta. Ricarica la pagina ed effettua di nuovo il login.");
        return;
    }

    generaSets();

    payload = {
        "workers": workers_id,
        "shifts": shifts,
        "H": hoursPerShift,
        "M": max_hours_per_worker,
        "avail": availability,
        "forbidden_pairs": forbiddenSet
    };

    const btn = document.getElementById("btngenera");
    const defaultBtnHtml = `<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>Genera Turni</span>`;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><span>Calcolo in corso...</span>`;

    try {
        const response = await fetch("https://backend-turni-ristorante.onrender.com/schedule", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const msg = errData.error || "Impossibile generare i turni. Errore generico.";
            alert(msg);
            btn.disabled = false;
            btn.innerHTML = defaultBtnHtml;
            return;
        }

        let data = await response.json();
        stampa(data);
        hasGeneratedSchedule = true;
        const pianSection = document.getElementById("sectionPianificazione");
        if (pianSection) pianSection.classList.add("can-expand");
        const genSection = document.getElementById("datiGenerati");
        genSection.style.display = "block";
        const togglePianBtn = document.getElementById("togglePianificazioneBtn");
        if (togglePianBtn) {
            togglePianBtn.disabled = false;
        }
        if (typeof setSectionCollapsed === "function") {
            setSectionCollapsed("sectionPianificazione", false);
        }
        btn.disabled = false;
        btn.innerHTML = defaultBtnHtml;
        setTimeout(() => {
            genSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 60);

    } catch (err) {
        console.error("Error fetching schedule:", err);
        alert("Errore di connessione al server.");
        btn.disabled = false;
        btn.innerHTML = defaultBtnHtml;
    }
}

let result = {};

// ==========================================
// STAMPA (LAYOUT GRIGLIA INTEGRATO)
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

    const workerNames = Object.keys(result).filter(k => k !== "⚠ NON COPERTI");
    const totalAssignedShifts = workerNames.reduce((acc, w) => acc + (result[w] ? result[w].length : 0), 0);
    const summaryEl = document.getElementById("generatedSummary");
    if (summaryEl) {
        summaryEl.innerText = `${workerNames.length} lavorator${workerNames.length === 1 ? "e" : "i"} · ${totalAssignedShifts} turni assegnati`;
    }

    // 1. GESTIONE NON COPERTI
    if (uncoveredData && uncoveredData.length > 0) {
        const aggregated = {};
        uncoveredData.forEach(u => {
            const key = `${u.giorno}|${u.turno}|${u.role}`;
            if (!aggregated[key]) aggregated[key] = 0;
            aggregated[key]++;
        });

        const displayList = Object.entries(aggregated).map(([key, count]) => {
            const [giorno, turno, role] = key.split("|");
            return { giorno, turno, role, count };
        });

        const daysOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
        displayList.sort((a, b) => {
            const dayDiff = daysOrder.indexOf(a.giorno) - daysOrder.indexOf(b.giorno);
            if (dayDiff !== 0) return dayDiff;
            const idxA = turnTypes.findIndex(tt => tt.name === a.turno);
            const idxB = turnTypes.findIndex(tt => tt.name === b.turno);
            return idxA - idxB;
        });

        let alertHtml = `<div class="uncovered-alert">
            <div class="uncovered-alert-header">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <h3>Turni scoperti (personale mancante)</h3>
            </div>
            <div class="uncovered-grid">`;

        for (const u of displayList) {
            alertHtml += `<div class="uncovered-item">
                <span class="badg-day">${u.giorno}</span>
                <span class="badg-turn">${u.turno}</span>
                <span class="badg-role">${u.role}</span>
                <span class="badg-count">${u.count} mancant${u.count === 1 ? 'e' : 'i'}</span>
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

        // Conversione da formato decimale (es. 7.5) a formato HH:MM (es. 7:30)
        let h = Math.floor(totOre);
        let m = Math.round((totOre - h) * 60);
        let oreFormattate = `${h}:${m.toString().padStart(2, '0')}`;

        const safeWorkerAttr = worker.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        const initial = worker.trim().charAt(0).toUpperCase() || "?";

        // Creiamo la card del lavoratore
        let cardHtml = `
        <div class="worker-report-card">
            <div class="worker-header">
                <div class="worker-header-info">
                    <span class="worker-avatar">${initial}</span>
                    <div class="worker-title-block">
                        <h3>${worker}</h3>
                        <span class="worker-shift-count">${workerTasks.length} turn${workerTasks.length === 1 ? "o assegnato" : "i assegnati"}</span>
                    </div>
                    <span class="total-badge">${oreFormattate} ore</span>
                </div>
                <div class="worker-header-actions">
                    <button type="button" class="btn-send-shifts" data-worker="${safeWorkerAttr}" onclick="openSendShifts(this.getAttribute('data-worker'))">
                        <i class="fa-regular fa-paper-plane" aria-hidden="true"></i> Invia turni
                    </button>
                </div>
            </div>
        <div class="week-grid">`;

        // Iteriamo i giorni per creare le caselle
        daysOrder.forEach(day => {
            const dailyTasks = workerTasks.filter(t => t.giorno === day);
            dailyTasks.sort((a, b) => {
                const idxA = turnTypes.findIndex(tt => tt.name === a.turno);
                const idxB = turnTypes.findIndex(tt => tt.name === b.turno);
                return idxA - idxB;
            });

            let dayContent = "";
            if (dailyTasks.length > 0) {
                dailyTasks.forEach(t => {
                    const tt = turnTypes.find(x => x.name === t.turno);
                    const timeStr = tt ? `${tt.start} - ${tt.end}` : "";
                    dayContent += `<div class="shift-chip">
                        <span class="s-turn">${t.turno}</span>
                        <span class="s-role">${t.role}</span>  
                        <span class="s-hours">${timeStr}</span>
                    </div>`;
                });
                cardHtml += `<div class="day-box active">
                    <div class="day-name">${day}</div>
                    <div class="day-shifts">${dayContent}</div>
                </div>`;
            } else {
                cardHtml += `<div class="day-box empty">
                    <div class="day-name">${day}</div>
                    <div class="day-shifts"><span class="rest-label">Riposo</span></div>
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

function openSendShifts(worker) {
    const workerTasks = result[worker] || [];
    const daysOrder = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
    const lines = [];

    daysOrder.forEach(day => {
        const dailyTasks = workerTasks
            .filter(t => t.giorno === day)
            .sort((a, b) => {
                const idxA = turnTypes.findIndex(tt => tt.name === a.turno);
                const idxB = turnTypes.findIndex(tt => tt.name === b.turno);
                return idxA - idxB;
            });

        if (dailyTasks.length > 0) {
            const shiftsStr = dailyTasks.map(t => {
                const tt = turnTypes.find(x => x.name === t.turno);
                const timeStr = tt ? ` (${tt.start} - ${tt.end})` : "";
                return `${t.turno}${timeStr} ${t.role}`;
            }).join("\n ");
            lines.push(`• ${day}:\n ${shiftsStr}`);
        }
    });

    const elencoTurni = lines.length > 0
        ? lines.join("\n")
        : "Nessun turno assegnato per questa settimana.";

    const message = `Ciao ${worker},\ni tuoi turni per questa settimana sono:\n\n${elencoTurni}\n\nBuon lavoro!`;

    document.getElementById("sendShiftsTitle").innerText = `Invia turni a ${worker}`;
    const textarea = document.getElementById("sendShiftsTextarea");
    textarea.value = message;

    const btn = document.getElementById("btnCopyShiftsMsg");
    if (btn) {
        btn.innerHTML = `<i class="fa-regular fa-copy" aria-hidden="true"></i> Copia messaggio`;
        btn.classList.remove("copied");
    }

    document.getElementById("sendShiftsModal").style.display = "flex";
}

function closeSendShifts() {
    document.getElementById("sendShiftsModal").style.display = "none";
}

function copyShiftsMessage() {
    const textarea = document.getElementById("sendShiftsTextarea");
    const btn = document.getElementById("btnCopyShiftsMsg");
    const text = textarea.value;

    const onCopied = () => {
        if (!btn) return;
        btn.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> Messaggio copiato!`;
        btn.classList.add("copied");
        clearTimeout(btn._copyTimeout);
        btn._copyTimeout = setTimeout(() => {
            btn.innerHTML = `<i class="fa-regular fa-copy" aria-hidden="true"></i> Copia messaggio`;
            btn.classList.remove("copied");
        }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onCopied).catch(() => {
            if (typeof fallbackCopyText === "function") fallbackCopyText(text, onCopied);
        });
    } else if (typeof fallbackCopyText === "function") {
        fallbackCopyText(text, onCopied);
    }
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
    const styleBorder = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };

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
            numFmt: "[h]:mm" // <-- MODIFICATO QUI
        },
        // Totale Settimanale (Footer) - Leggermente più scuro per stacco visivo
        totalFooter: {
            font: { bold: true, color: { rgb: "000000" } },
            fill: { fgColor: TOTAL_COLOR },
            border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } },
            alignment: { horizontal: "center", vertical: "center" },
            numFmt: "[h]:mm" // <-- MODIFICATO QUI
        },
        // Incrocio Totale (Angolo in basso a destra)
        grandTotal: {
            font: { bold: true, sz: 12, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "BFBFBF" } },
            border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } },
            alignment: { horizontal: "center", vertical: "center" },
            numFmt: "[h]:mm" // <-- MODIFICATO QUI
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
        for (let i = 0; i < totalCols; i++) {
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
    for (let i = 0; i < totalCols; i++) headerRow.push({ v: "", s: styles.header });

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
                if (!map[k]) map[k] = { ...u, count: 0 };
                map[k].count++;
            });
            uncoveredGrouped = Object.values(map).sort((a, b) => getTimes(a.turno).start.localeCompare(getTimes(b.turno).start));
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
        for (let i = 0; i < rowsNeeded; i++) ws_data.push(createEmptyRow());

        // 4. Colonna Giorno
        ws_data[startRow][0] = { v: giorno.toUpperCase(), s: styles.dayCol };
        merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow + rowsNeeded - 1, c: 0 } });

        const rowDailyTotalRefs = [];

        // 5. Lavoratori
        realWorkers.forEach(w => {
            const cIdx = colMap[w];
            const tasks = (result[w] || []).filter(t => t.giorno === giorno);
            tasks.sort((a, b) => getTimes(a.turno).start.localeCompare(getTimes(b.turno).start));

            const timePairsRefs = [];

            if (tasks.length === 0) {
                ws_data[startRow][cIdx] = { v: "Riposo", s: styles.rest };
                for (let r = 1; r < rowsNeeded; r++) ws_data[startRow + r][cIdx].s = styles.rest;
                merges.push({ s: { r: startRow, c: cIdx }, e: { r: startRow + rowsNeeded - 1, c: cIdx } });

                // NUOVO: Creiamo i riferimenti invisibili così la formula è già pronta all'uso
                // Si basa su quante righe (slot) ha il lavoratore con più turni quel giorno
                for (let index = 0; index < maxWorkerShifts; index++) {
                    const rBase = startRow + (index * 3);
                    timePairsRefs.push({
                        start: getCellRef(rBase + 1, cIdx),
                        end: getCellRef(rBase + 2, cIdx)
                    });
                }
            } else {
                tasks.forEach((task, index) => {
                    const rBase = startRow + (index * 3);
                    const times = getTimes(task.turno);

                    ws_data[rBase][cIdx] = { v: task.role, s: styles.role };

                    ws_data[rBase + 1][cIdx] = {
                        v: timeToExcelSerial(times.start), t: 'n', s: styles.time
                    };
                    ws_data[rBase + 2][cIdx] = {
                        v: timeToExcelSerial(times.end), t: 'n', s: styles.time
                    };

                    timePairsRefs.push({
                        start: getCellRef(rBase + 1, cIdx),
                        end: getCellRef(rBase + 2, cIdx)
                    });
                });
            }

            if (!this.dailyFormulasMap) this.dailyFormulasMap = {};
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
        for (let i = 0; i < totalCols; i++) summaryRow.push({ v: "", s: styles.total });

        const summaryRowIndex = ws_data.length;

        summaryRow[0] = { v: "TOT. " + giorno.substr(0, 3).toUpperCase(), s: styles.total };

        realWorkers.forEach(w => {
            const cIdx = colMap[w];
            const timePairs = this.dailyFormulasMap[w];

            if (timePairs && timePairs.length > 0) {
                // NUOVO: Usiamo IFERROR per prevenire l'errore #VALORE! causato dalla scritta "Riposo"
                const parts = timePairs.map(p => `IFERROR(MOD(${p.end}-${p.start},1),0)`);
                const formula = `${parts.join("+")}`;

                summaryRow[cIdx] = { t: 'n', f: formula, s: styles.total };
                workerDailyTotalRefs[w].push(getCellRef(summaryRowIndex, cIdx));
                rowDailyTotalRefs.push(getCellRef(summaryRowIndex, cIdx));
            } else {
                // Questo scatta solo se l'intero ristorante è chiuso (maxWorkerShifts = 0)
                summaryRow[cIdx] = { v: 0, t: 'n', s: styles.total };
                workerDailyTotalRefs[w].push(getCellRef(summaryRowIndex, cIdx));
                rowDailyTotalRefs.push(getCellRef(summaryRowIndex, cIdx));
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
    for (let i = 0; i < totalCols; i++) footerRow.push({ v: "", s: styles.totalFooter });

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

// ==========================================
// PDF EXPORT (STESSO CONTENUTO E COLORI DELL'EXCEL)
// ==========================================
function exportScheduleToPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("Errore: Libreria jsPDF non caricata.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const formatHoursHHMM = (hoursDec) => {
        const totalMin = Math.round((hoursDec || 0) * 60);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return `${h}:${m.toString().padStart(2, "0")}`;
    };

    const getTimes = (turnName) => {
        const tt = turnTypes.find(x => x.name === turnName);
        return tt ? { start: tt.start, end: tt.end } : { start: "00:00", end: "00:00" };
    };

    const realWorkers = Object.keys(result).filter(k =>
        k && k !== "⚠ NON COPERTI" && k !== "undefined" && k !== "null" && String(k).trim().length > 0
    ).sort();

    const uncoveredKey = "⚠ NON COPERTI";
    const hasUncovered = result[uncoveredKey] && Array.isArray(result[uncoveredKey]) && result[uncoveredKey].length > 0;

    // Intestazione colonne identica a Excel
    const headRow = ["GIORNO", ...realWorkers];
    if (hasUncovered) headRow.push("SCOPERTI");
    headRow.push("TOTALE");

    const totalCols = headRow.length;
    const totColIdx = totalCols - 1;
    const scopertiColIdx = hasUncovered ? totalCols - 2 : -1;

    const body = [];
    const days = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

    const weeklyWorkerHours = {};
    realWorkers.forEach(w => { weeklyWorkerHours[w] = 0; });
    let grandTotalHours = 0;

    // Colori coordinati con Excel
    const COLOR_HEADER = [68, 84, 106];    // #44546A
    const COLOR_DAY = [231, 230, 230];     // #E7E6E6
    const COLOR_ROLE = [221, 235, 247];    // #DDEBF7
    const COLOR_REST = [255, 242, 204];    // #FFF2CC
    const COLOR_UNCOV = [255, 199, 206];   // #FFC7CE
    const COLOR_UNCOV_TXT = [156, 0, 6];   // #9C0006
    const COLOR_TOTAL = [217, 217, 217];   // #D9D9D9
    const COLOR_GRAND = [191, 191, 191];   // #BFBFBF

    days.forEach(giorno => {
        let uncoveredGrouped = [];
        if (hasUncovered) {
            const raw = (result[uncoveredKey] || []).filter(t => t.giorno === giorno);
            const map = {};
            raw.forEach(u => {
                const k = u.turno + "|" + u.role;
                if (!map[k]) map[k] = { ...u, count: 0 };
                map[k].count++;
            });
            uncoveredGrouped = Object.values(map).sort((a, b) => getTimes(a.turno).start.localeCompare(getTimes(b.turno).start));
        }

        let maxWorkerShifts = 0;
        realWorkers.forEach(w => {
            const count = (result[w] || []).filter(t => t.giorno === giorno).length;
            if (count > maxWorkerShifts) maxWorkerShifts = count;
        });

        const rowsForWorkers = maxWorkerShifts * 3;
        const rowsForUncovered = uncoveredGrouped.length;
        let rowsNeeded = Math.max(rowsForWorkers, rowsForUncovered, 1);

        // Creiamo la matrice di celle del giorno
        const dayRows = Array.from({ length: rowsNeeded }, () =>
            Array.from({ length: totalCols }, (_, cIdx) => ({
                content: "",
                styles: cIdx === totColIdx
                    ? { fillColor: COLOR_TOTAL }
                    : { fillColor: [255, 255, 255] }
            }))
        );

        // Colonna GIORNO (unita verticalmente)
        dayRows[0][0] = {
            content: giorno.toUpperCase(),
            rowSpan: rowsNeeded,
            styles: {
                fillColor: COLOR_DAY,
                fontStyle: "bold",
                halign: "center",
                valign: "middle"
            }
        };
        for (let r = 1; r < rowsNeeded; r++) {
            dayRows[r][0] = null;
        }

        let dayTotalHours = 0;
        const dailyWorkerHours = {};

        realWorkers.forEach((w, idx) => {
            const cIdx = idx + 1;
            const tasks = (result[w] || []).filter(t => t.giorno === giorno);
            tasks.sort((a, b) => getTimes(a.turno).start.localeCompare(getTimes(b.turno).start));

            const wDayHours = tasks.reduce((acc, t) => acc + (t.ore || 0), 0);
            dailyWorkerHours[w] = wDayHours;
            weeklyWorkerHours[w] += wDayHours;
            dayTotalHours += wDayHours;

            if (tasks.length === 0) {
                dayRows[0][cIdx] = {
                    content: "Riposo",
                    rowSpan: rowsNeeded,
                    styles: {
                        fillColor: COLOR_REST,
                        fontStyle: "italic",
                        textColor: [85, 85, 85],
                        halign: "center",
                        valign: "middle"
                    }
                };
                for (let r = 1; r < rowsNeeded; r++) {
                    dayRows[r][cIdx] = null;
                }
            } else {
                tasks.forEach((task, sIdx) => {
                    const rBase = sIdx * 3;
                    const times = getTimes(task.turno);
                    dayRows[rBase][cIdx] = {
                        content: task.role,
                        styles: {
                            fillColor: COLOR_ROLE,
                            fontStyle: "bold",
                            textColor: [0, 0, 0],
                            halign: "center",
                            valign: "middle"
                        }
                    };
                    dayRows[rBase + 1][cIdx] = {
                        content: times.start,
                        styles: {
                            fillColor: [255, 255, 255],
                            halign: "center",
                            valign: "middle"
                        }
                    };
                    dayRows[rBase + 2][cIdx] = {
                        content: times.end,
                        styles: {
                            fillColor: [255, 255, 255],
                            halign: "center",
                            valign: "middle"
                        }
                    };
                });
            }
        });

        grandTotalHours += dayTotalHours;

        if (hasUncovered && uncoveredGrouped.length > 0) {
            uncoveredGrouped.forEach((item, index) => {
                dayRows[index][scopertiColIdx] = {
                    content: `${item.turno} | ${item.role} | ${item.count}`,
                    styles: {
                        fillColor: COLOR_UNCOV,
                        textColor: COLOR_UNCOV_TXT,
                        fontStyle: "bold",
                        halign: "center",
                        valign: "middle"
                    }
                };
            });
        }

        dayRows.forEach(r => body.push(r.filter(cell => cell !== null)));

        // Riga riepilogo giornaliero (TOT. GIORNO)
        const summaryRow = Array.from({ length: totalCols }, () => ({
            content: "",
            styles: {
                fillColor: COLOR_TOTAL,
                fontStyle: "bold",
                halign: "center",
                valign: "middle"
            }
        }));
        summaryRow[0].content = "TOT. " + giorno.substr(0, 3).toUpperCase();
        realWorkers.forEach((w, idx) => {
            summaryRow[idx + 1].content = formatHoursHHMM(dailyWorkerHours[w]);
        });
        if (hasUncovered) {
            summaryRow[scopertiColIdx].content = "-";
        }
        summaryRow[totColIdx].content = formatHoursHHMM(dayTotalHours);
        body.push(summaryRow);
    });

    // Riga TOTALE SETTIMANALE
    const footerRow = Array.from({ length: totalCols }, () => ({
        content: "",
        styles: {
            fillColor: COLOR_TOTAL,
            fontStyle: "bold",
            textColor: [0, 0, 0],
            halign: "center",
            valign: "middle"
        }
    }));
    footerRow[0].content = "TOTALE";
    realWorkers.forEach((w, idx) => {
        footerRow[idx + 1].content = formatHoursHHMM(weeklyWorkerHours[w]);
    });
    if (hasUncovered) {
        footerRow[scopertiColIdx].content = "";
    }
    footerRow[totColIdx] = {
        content: formatHoursHHMM(grandTotalHours),
        styles: {
            fillColor: COLOR_GRAND,
            fontStyle: "bold",
            textColor: [0, 0, 0],
            halign: "center",
            valign: "middle"
        }
    };
    body.push(footerRow);

    doc.autoTable({
        head: [headRow],
        body: body,
        theme: "grid",
        margin: { top: 8, right: 8, bottom: 8, left: 8 },
        styles: {
            fontSize: 7.5,
            cellPadding: 1.3,
            lineColor: [180, 180, 180],
            lineWidth: 0.15,
            textColor: [26, 29, 35],
            halign: "center",
            valign: "middle"
        },
        headStyles: {
            fillColor: COLOR_HEADER,
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8.5,
            cellPadding: 2
        }
    });

    doc.save("turni_ristorante.pdf");
}