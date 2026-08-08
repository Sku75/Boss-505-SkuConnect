const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

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

const datenOrdner = path.join(__dirname, 'Stationsdaten', 'ROLAND');

// --- Station finden ---

function findeStation() {
  const buchstaben = 'DEFGHIJKLMNOPQRSTUVWXYZ';
  for (const b of buchstaben) {
    try {
      const rolandPfad = path.join(b + ':\\', 'ROLAND');
      if (fs.existsSync(path.join(rolandPfad, 'DATA', 'MEMORY.RC0'))) {
        return { gefunden: true, laufwerk: b, rolandPfad };
      }
    } catch { /* Laufwerk nicht lesbar */ }
  }
  return { gefunden: false };
}

// --- Einlesen. Alles asynchron, damit die Oberflaeche nie einfriert. ---

// Die beiden Einstellungsdateien, zusammen rund 1,7 MB. Geht sofort.
async function einstellungenEinlesen(rolandPfad) {
  const ziel = path.join(datenOrdner, 'DATA');
  await fsp.mkdir(ziel, { recursive: true });
  let gesamt = 0;
  for (const datei of ['MEMORY.RC0', 'SYSTEM.RC0']) {
    const quelle = path.join(rolandPfad, 'DATA', datei);
    await fsp.copyFile(quelle, path.join(ziel, datei));
    gesamt += (await fsp.stat(quelle)).size;
  }
  return { dateien: 2, bytes: gesamt };
}

// Die Loop-Aufnahmen, hier 182 MB. Dauert, laeuft aber im Hintergrund weiter.
async function loopsEinlesen(rolandPfad) {
  const quelle = path.join(rolandPfad, 'WAVE');
  const ziel = path.join(datenOrdner, 'WAVE');
  await fsp.rm(ziel, { recursive: true, force: true });
  await fsp.cp(quelle, ziel, { recursive: true });
  const zaehle = async (p) => {
    let n = 0;
    for (const e of await fsp.readdir(p, { withFileTypes: true })) {
      if (e.isDirectory()) n += await zaehle(path.join(p, e.name));
      else n += 1;
    }
    return n;
  };
  const a = await zaehle(quelle);
  const b = await zaehle(ziel);
  return { quelle: a, kopie: b, vollstaendig: a === b };
}

// --- Speicherplaetze auswerten ---

function feldLesen(block, abschnitt, feld) {
  const a = new RegExp(`<${abschnitt}>([\\s\\S]*?)</${abschnitt}>`).exec(block);
  if (!a) return null;
  const f = new RegExp(`<${feld}>([\\s\\S]*?)</${feld}>`).exec(a[1]);
  return f ? f[1] : null;
}

async function speicherplaetzeLesen(rolandPfad) {
  const datei = path.join(rolandPfad, 'DATA', 'MEMORY.RC0');
  const inhalt = (await fsp.readFile(datei, 'utf8')).replace(/\0/g, '');
  const teile = inhalt.split(/<mem id="(\d+)">/);
  const plaetze = [];
  for (let i = 1; i < teile.length - 1; i += 2) {
    const nummer = parseInt(teile[i], 10) + 1;
    const block = teile[i + 1];

    const namensBlock = /<NAME>([\s\S]*?)<\/NAME>/.exec(block);
    let name = '';
    if (namensBlock) {
      for (const t of namensBlock[1].matchAll(/<C\d+>(\d+)<\/C\d+>/g)) {
        name += String.fromCharCode(parseInt(t[1], 10));
      }
    }

    let spuren = 0;
    for (let s = 1; s <= 5; s++) {
      if ((feldLesen(block, 'TRACK' + s, 'WavStat') || '0') !== '0') spuren++;
    }

    const lpLen = parseInt(feldLesen(block, 'PLAY_OPTION', 'LpLen') || '0', 10);
    const tempo = parseInt(feldLesen(block, 'MASTER', 'Tmp') || '0', 10) / 10;

    plaetze.push({ nummer, name: name.trim(), spuren, lpLen, tempo });
  }
  return plaetze;
}

// --- Kenndaten ---

async function kenndatenLesen(rolandPfad) {
  const datei = path.join(rolandPfad, 'DATA', 'MEMORY.RC0');
  const griff = await fsp.open(datei, 'r');
  const puffer = Buffer.alloc(300);
  await griff.read(puffer, 0, 300, 0);
  await griff.close();
  const kopf = puffer.toString('utf8');
  const name = /name="([^"]+)"/.exec(kopf);
  const revision = /revision="([^"]+)"/.exec(kopf);
  return { geraet: name ? name[1] : null, revision: revision ? revision[1] : null };
}

// --- Verbindung zur Oberflaeche ---

function sicher(fn) {
  return async (ereignis, ...rest) => {
    try { return { ok: true, ...(await fn(...rest)) }; }
    catch (fehler) { return { ok: false, fehler: String(fehler.message || fehler) }; }
  };
}

ipcMain.handle('station-suchen', sicher(async () => findeStation()));
ipcMain.handle('einstellungen-einlesen', sicher(einstellungenEinlesen));
ipcMain.handle('loops-einlesen', sicher(loopsEinlesen));
ipcMain.handle('kenndaten-lesen', sicher(kenndatenLesen));
ipcMain.handle('speicherplaetze-lesen', sicher(async (p) => ({ plaetze: await speicherplaetzeLesen(p) })));
ipcMain.handle('datenordner', sicher(async () => ({ pfad: datenOrdner, vorhanden: fs.existsSync(path.join(datenOrdner, 'DATA', 'MEMORY.RC0')) })));

app.whenReady().then(() => {
  erstelleFenster();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
