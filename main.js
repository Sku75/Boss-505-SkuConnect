const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function erstelleFenster() {
  const fenster = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  fenster.loadFile('index.html');
}

// --- Werkstatt: Station im Speicher-Modus finden, sichern, pruefen ---

// Sucht auf allen Laufwerken nach dem ROLAND-Ordner der Station.
function findeStation() {
  const buchstaben = 'DEFGHIJKLMNOPQRSTUVWXYZ';
  for (const b of buchstaben) {
    const wurzel = b + ':\\';
    try {
      const rolandPfad = path.join(wurzel, 'ROLAND');
      if (fs.existsSync(rolandPfad) && fs.statSync(rolandPfad).isDirectory()) {
        return { gefunden: true, laufwerk: wurzel, rolandPfad };
      }
    } catch { /* Laufwerk nicht lesbar, weiter */ }
  }
  return { gefunden: false };
}

// Liest die Kenndaten aus dem Datenbestand (Formatversion der Speicherdatei).
function leseKenndaten(rolandPfad) {
  const ergebnis = { ordner: [], speicherDatei: null, revision: null, geraeteName: null };
  ergebnis.ordner = fs.readdirSync(rolandPfad);
  const dataPfad = path.join(rolandPfad, 'DATA');
  if (fs.existsSync(dataPfad)) {
    const dateien = fs.readdirSync(dataPfad).filter(d => /^MEMORY.*\.RC0$/i.test(d));
    if (dateien.length > 0) {
      const datei = path.join(dataPfad, dateien[0]);
      ergebnis.speicherDatei = dateien[0];
      const kopf = fs.readFileSync(datei, { encoding: 'utf8' }).slice(0, 500);
      const nameTreffer = kopf.match(/name="([^"]+)"/);
      const revisionTreffer = kopf.match(/revision="([^"]+)"/);
      if (nameTreffer) ergebnis.geraeteName = nameTreffer[1];
      if (revisionTreffer) ergebnis.revision = revisionTreffer[1];
    }
  }
  return ergebnis;
}

// Liest den kompletten ROLAND-Ordner in den festen Projektordner Stationsdaten ein.
// Versionierung uebernimmt Git: jeder eingelesene Stand wird committet, die
// Historie ist das Backup (Nutzerentscheidung, keine eigenen Sicherungskopien).
function erstelleBackup(rolandPfad) {
  const ziel = path.join(__dirname, 'Stationsdaten', 'ROLAND');
  fs.rmSync(ziel, { recursive: true, force: true });
  fs.cpSync(rolandPfad, ziel, { recursive: true });
  // Kurz pruefen: Anzahl Dateien in Quelle und Ziel vergleichen.
  const zaehle = (p) => {
    let n = 0;
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) n += zaehle(path.join(p, e.name));
      else n += 1;
    }
    return n;
  };
  const quelle = zaehle(rolandPfad);
  const kopie = zaehle(ziel);
  return { ziel, quelle, kopie, vollstaendig: quelle === kopie };
}

ipcMain.handle('station-suchen', () => {
  try { return findeStation(); }
  catch (fehler) { return { gefunden: false, fehler: String(fehler) }; }
});

ipcMain.handle('kenndaten-lesen', (ereignis, rolandPfad) => {
  try { return { ok: true, ...leseKenndaten(rolandPfad) }; }
  catch (fehler) { return { ok: false, fehler: String(fehler) }; }
});

ipcMain.handle('backup-erstellen', (ereignis, rolandPfad) => {
  try { return { ok: true, ...erstelleBackup(rolandPfad) }; }
  catch (fehler) { return { ok: false, fehler: String(fehler) }; }
});

app.whenReady().then(() => {
  erstelleFenster();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
