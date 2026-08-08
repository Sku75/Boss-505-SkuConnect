const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { execFile } = require('child_process');

function erstelleFenster() {
  // Die Menueleiste ganz entfernen. Sonst haengt sie im Baum der
  // Sprachausgabe und wird beim Start mit vorgelesen.
  Menu.setApplicationMenu(null);

  const fenster = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: '#000000',
    // Erst zeigen, wenn alles geladen ist. Sonst meldet die Sprachausgabe
    // das Fenster mehrfach: einmal leer, einmal beim Laden, einmal fertig.
    show: false,
    title: 'Sku505',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  // MIDI im Fenster zulassen, sonst verweigert Electron den Zugriff.
  fenster.webContents.session.setPermissionRequestHandler((inhalt, recht, erlauben) => {
    erlauben(recht === 'midi' || recht === 'midiSysex' || recht === 'media');
  });
  // Titel festhalten, damit ein Wechsel keine zweite Ansage ausloest.
  fenster.on('page-title-updated', (ereignis) => ereignis.preventDefault());
  fenster.once('ready-to-show', () => fenster.show());
  fenster.loadFile('index.html');
}

const datenOrdner = path.join(__dirname, 'Stationsdaten', 'ROLAND');

// =====================================================================
// Station finden
// =====================================================================

function findeStation() {
  for (const b of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    try {
      const rolandPfad = path.join(b + ':\\', 'ROLAND');
      if (fs.existsSync(path.join(rolandPfad, 'DATA', 'MEMORY.RC0'))) {
        return { gefunden: true, laufwerk: b, rolandPfad };
      }
    } catch { /* Laufwerk nicht lesbar */ }
  }
  return { gefunden: false };
}

function dateiPfad(rolandPfad, welche) {
  return path.join(rolandPfad, 'DATA', welche === 'SYSTEM' ? 'SYSTEM.RC0' : 'MEMORY.RC0');
}

// =====================================================================
// XML-Zugriff. Bewusst als Textarbeit auf der Originaldatei, damit beim
// Schreiben ausschliesslich der eine Zielwert ersetzt wird und jedes
// andere Byte unveraendert bleibt.
// =====================================================================

// Grenzen eines Speicherplatz-Blocks <mem id="N"> bis zum naechsten.
function blockGrenzen(inhalt, id) {
  const start = inhalt.indexOf(`<mem id="${id}">`);
  if (start < 0) return null;
  let ende = inhalt.indexOf('<mem id="', start + 1);
  if (ende < 0) ende = inhalt.indexOf('</database>', start);
  if (ende < 0) ende = inhalt.length;
  return { start, ende };
}

// Grenzen eines Abschnitts innerhalb eines Bereichs.
function abschnittGrenzen(inhalt, abschnitt, von, bis) {
  const auf = inhalt.indexOf(`<${abschnitt}>`, von);
  if (auf < 0 || auf >= bis) return null;
  const zu = inhalt.indexOf(`</${abschnitt}>`, auf);
  if (zu < 0 || zu > bis) return null;
  return { start: auf + abschnitt.length + 2, ende: zu };
}

// Grenzen des Wertes eines Feldes innerhalb eines Bereichs.
function feldGrenzen(inhalt, feld, von, bis) {
  const auf = inhalt.indexOf(`<${feld}>`, von);
  if (auf < 0 || auf >= bis) return null;
  const zu = inhalt.indexOf(`</${feld}>`, auf);
  if (zu < 0 || zu > bis) return null;
  return { start: auf + feld.length + 2, ende: zu };
}

// Liest alle Felder eines Abschnitts als Objekt.
function abschnittLesen(inhalt, abschnitt, von, bis) {
  const g = abschnittGrenzen(inhalt, abschnitt, von, bis);
  if (!g) return null;
  const text = inhalt.slice(g.start, g.ende);
  const werte = {};
  for (const t of text.matchAll(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g)) {
    werte[t[1]] = t[2];
  }
  return werte;
}

// =====================================================================
// Lesen
// =====================================================================

async function dateiLesen(rolandPfad, welche) {
  return await fsp.readFile(dateiPfad(rolandPfad, welche), 'latin1');
}

function nameAusBlock(inhalt, von, bis) {
  const g = abschnittGrenzen(inhalt, 'NAME', von, bis);
  if (!g) return '';
  let name = '';
  for (const t of inhalt.slice(g.start, g.ende).matchAll(/<C\d+>(\d+)<\/C\d+>/g)) {
    name += String.fromCharCode(parseInt(t[1], 10));
  }
  return name;
}

// Kurzliste aller 99 Plaetze fuer das Menue.
async function speicherplaetzeLesen(rolandPfad) {
  const inhalt = await dateiLesen(rolandPfad, 'MEMORY');
  const plaetze = [];
  for (let id = 0; id < 99; id++) {
    const g = blockGrenzen(inhalt, id);
    if (!g) break;
    const play = abschnittLesen(inhalt, 'PLAY_OPTION', g.start, g.ende) || {};
    const master = abschnittLesen(inhalt, 'MASTER', g.start, g.ende) || {};
    let spuren = 0;
    for (let s = 1; s <= 5; s++) {
      const tr = abschnittLesen(inhalt, 'TRACK' + s, g.start, g.ende) || {};
      if ((tr.WavStat || '0') !== '0') spuren++;
    }
    plaetze.push({
      nummer: id + 1,
      name: nameAusBlock(inhalt, g.start, g.ende).trim(),
      spuren,
      lpLen: parseInt(play.LpLen || '0', 10),
      tempo: parseInt(master.Tmp || '0', 10) / 10
    });
  }
  return plaetze;
}

// Alle Werte eines einzelnen Speicherplatzes.
async function speicherplatzLesen(rolandPfad, nummer) {
  const inhalt = await dateiLesen(rolandPfad, 'MEMORY');
  const g = blockGrenzen(inhalt, nummer - 1);
  if (!g) throw new Error('Speicherplatz ' + nummer + ' nicht gefunden');
  const daten = { nummer, name: nameAusBlock(inhalt, g.start, g.ende) };
  const abschnitte = ['MASTER', 'REC_OPTION', 'PLAY_OPTION', 'RHYTHM',
    'TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5',
    'INPUT_FX', 'TRACK_FX',
    'INPUT_FX1', 'INPUT_FX2', 'INPUT_FX3',
    'TRACK_FX1', 'TRACK_FX2', 'TRACK_FX3',
    'BEAT_FX1', 'BEAT_FX2', 'BEAT_FX3'];
  for (const a of abschnitte) daten[a] = abschnittLesen(inhalt, a, g.start, g.ende) || {};
  for (let i = 1; i <= 16; i++) {
    daten['ASSIGN' + i] = abschnittLesen(inhalt, 'ASSIGN' + i, g.start, g.ende) || {};
  }
  return daten;
}

// Systemeinstellungen der Station.
async function systemLesen(rolandPfad) {
  const inhalt = await dateiLesen(rolandPfad, 'SYSTEM');
  const daten = {};
  for (const a of ['SETUP', 'INPUT_OUTPUT', 'USB', 'MIDI']) {
    const w = abschnittLesen(inhalt, a, 0, inhalt.length);
    if (w) daten[a] = w;
  }
  return daten;
}

async function kenndatenLesen(rolandPfad) {
  const griff = await fsp.open(dateiPfad(rolandPfad, 'MEMORY'), 'r');
  const puffer = Buffer.alloc(300);
  await griff.read(puffer, 0, 300, 0);
  await griff.close();
  const kopf = puffer.toString('latin1');
  const name = /name="([^"]+)"/.exec(kopf);
  const revision = /revision="([^"]+)"/.exec(kopf);
  return { geraet: name ? name[1] : null, revision: revision ? revision[1] : null };
}

// =====================================================================
// Schreiben. Immer minimal, immer mit Ruecklesen und Vergleich.
// =====================================================================

// Sichert den Stand der Station, bevor etwas veraendert wird: erst in den
// Projektordner kopieren, dann in Git festschreiben. So bleibt jeder Zustand
// vor einer Aenderung in der Git-Geschichte erhalten. Aendert sich nichts,
// legt Git auch nichts an.
async function standSichern(rolandPfad) {
  const ziel = path.join(datenOrdner, 'DATA');
  await fsp.mkdir(ziel, { recursive: true });
  for (const d of ['MEMORY.RC0', 'SYSTEM.RC0']) {
    await fsp.copyFile(path.join(rolandPfad, 'DATA', d), path.join(ziel, d));
  }
  await gitSichern('Stand der Station vor einer Aenderung');
}

// Setzt genau ein Feld. Alles andere in der Datei bleibt unberuehrt.
async function wertSchreiben(rolandPfad, auftrag, ohneSicherung) {
  const { datei, nummer, abschnitt, feld, wert } = auftrag;
  if (!ohneSicherung) await standSichern(rolandPfad);

  const pfad = dateiPfad(rolandPfad, datei);
  const inhalt = await fsp.readFile(pfad, 'latin1');

  let von = 0, bis = inhalt.length;
  if (datei === 'MEMORY') {
    const g = blockGrenzen(inhalt, nummer - 1);
    if (!g) throw new Error('Speicherplatz nicht gefunden');
    von = g.start; bis = g.ende;
  }
  const a = abschnittGrenzen(inhalt, abschnitt, von, bis);
  if (!a) throw new Error('Abschnitt ' + abschnitt + ' nicht gefunden');
  const f = feldGrenzen(inhalt, feld, a.start, a.ende);
  if (!f) throw new Error('Feld ' + feld + ' nicht gefunden');

  const alt = inhalt.slice(f.start, f.ende);
  const neu = String(wert);
  if (alt === neu) return { geaendert: false, alt, neu };

  const neuerInhalt = inhalt.slice(0, f.start) + neu + inhalt.slice(f.ende);
  await fsp.writeFile(pfad, neuerInhalt, 'latin1');

  // Ruecklesen und pruefen, dass genau der gewuenschte Wert dort steht.
  const kontrolle = await fsp.readFile(pfad, 'latin1');
  let kvon = 0, kbis = kontrolle.length;
  if (datei === 'MEMORY') {
    const g = blockGrenzen(kontrolle, nummer - 1);
    kvon = g.start; kbis = g.ende;
  }
  const ka = abschnittGrenzen(kontrolle, abschnitt, kvon, kbis);
  const kf = feldGrenzen(kontrolle, feld, ka.start, ka.ende);
  const gelesen = kontrolle.slice(kf.start, kf.ende);
  const laengeStimmt = kontrolle.length === neuerInhalt.length;

  return { geaendert: true, alt, neu, gelesen, bestaetigt: gelesen === neu && laengeStimmt };
}

// Setzt den Namen eines Speicherplatzes, 12 Zeichen.
async function nameSchreiben(rolandPfad, nummer, name) {
  const text = (name + '            ').slice(0, 12);
  let geaendert = 0;
  // Einmal sichern, dann die zwoelf Zeichen einzeln setzen.
  await standSichern(rolandPfad);
  for (let i = 0; i < 12; i++) {
    const feld = 'C' + String(i + 1).padStart(2, '0');
    const e = await wertSchreiben(rolandPfad, {
      datei: 'MEMORY', nummer, abschnitt: 'NAME', feld,
      wert: text.charCodeAt(i)
    }, true);
    if (e.geaendert) {
      if (!e.bestaetigt) throw new Error('Zeichen ' + (i + 1) + ' nicht bestaetigt');
      geaendert++;
    }
  }
  return { name: text.trim(), zeichenGeaendert: geaendert };
}

// Kopiert alle Einstellungen eines Platzes auf einen anderen.
// Die Loop-Aufnahmen bleiben unberuehrt, darauf weist die Oberflaeche hin.
async function platzKopieren(rolandPfad, vonNummer, nachNummer) {
  if (vonNummer === nachNummer) throw new Error('Quelle und Ziel sind gleich');
  await standSichern(rolandPfad);
  const pfad = dateiPfad(rolandPfad, 'MEMORY');
  const inhalt = await fsp.readFile(pfad, 'latin1');
  const q = blockGrenzen(inhalt, vonNummer - 1);
  const z = blockGrenzen(inhalt, nachNummer - 1);
  if (!q || !z) throw new Error('Speicherplatz nicht gefunden');

  // Nur den Inhalt hinter der id-Zeile uebernehmen, damit die Ziel-id bleibt.
  const quellKopf = `<mem id="${vonNummer - 1}">`;
  const zielKopf = `<mem id="${nachNummer - 1}">`;
  const quellInhalt = inhalt.slice(q.start + quellKopf.length, q.ende);
  const neuerBlock = zielKopf + quellInhalt;

  const neuerInhalt = inhalt.slice(0, z.start) + neuerBlock + inhalt.slice(z.ende);
  await fsp.writeFile(pfad, neuerInhalt, 'latin1');

  const kontrolle = await fsp.readFile(pfad, 'latin1');
  const kz = blockGrenzen(kontrolle, nachNummer - 1);
  const bestaetigt = kontrolle.slice(kz.start, kz.ende) === neuerBlock;
  return { bestaetigt };
}

// Tauscht die Einstellungen zweier Plaetze.
async function platzTauschen(rolandPfad, a, b) {
  if (a === b) throw new Error('Beide Plaetze sind gleich');
  await standSichern(rolandPfad);
  const pfad = dateiPfad(rolandPfad, 'MEMORY');
  const inhalt = await fsp.readFile(pfad, 'latin1');
  const ga = blockGrenzen(inhalt, a - 1);
  const gb = blockGrenzen(inhalt, b - 1);
  if (!ga || !gb) throw new Error('Speicherplatz nicht gefunden');

  const kopfA = `<mem id="${a - 1}">`;
  const kopfB = `<mem id="${b - 1}">`;
  const inhaltA = inhalt.slice(ga.start + kopfA.length, ga.ende);
  const inhaltB = inhalt.slice(gb.start + kopfB.length, gb.ende);

  // Von hinten nach vorne ersetzen, damit die Indizes gueltig bleiben.
  const [erst, zweit] = ga.start < gb.start ? [ga, gb] : [gb, ga];
  const [kopfErst, kopfZweit] = ga.start < gb.start ? [kopfA, kopfB] : [kopfB, kopfA];
  const [neuErst, neuZweit] = ga.start < gb.start ? [inhaltB, inhaltA] : [inhaltA, inhaltB];

  let neuerInhalt = inhalt.slice(0, zweit.start) + kopfZweit + neuZweit + inhalt.slice(zweit.ende);
  neuerInhalt = neuerInhalt.slice(0, erst.start) + kopfErst + neuErst + neuerInhalt.slice(erst.ende);
  await fsp.writeFile(pfad, neuerInhalt, 'latin1');

  const kontrolle = await fsp.readFile(pfad, 'latin1');
  const ka = blockGrenzen(kontrolle, a - 1);
  const bestaetigt = kontrolle.slice(ka.start + kopfA.length, ka.ende) === inhaltB;
  return { bestaetigt };
}

// =====================================================================
// Loop-Dateien
// =====================================================================

function wavOrdner(rolandPfad, nummer, spur) {
  return path.join(rolandPfad, 'WAVE',
    String(nummer).padStart(3, '0') + '_' + spur);
}

async function loopsAuflisten(rolandPfad, nummer) {
  const liste = [];
  for (let spur = 1; spur <= 5; spur++) {
    const ordner = wavOrdner(rolandPfad, nummer, spur);
    let datei = null, bytes = 0;
    try {
      const dateien = (await fsp.readdir(ordner)).filter(d => /\.wav$/i.test(d));
      if (dateien.length) {
        datei = dateien[0];
        bytes = (await fsp.stat(path.join(ordner, datei))).size;
      }
    } catch { /* Ordner fehlt, Spur leer */ }
    // 44100 Hz, 16 Bit, Stereo ergibt 176400 Bytes je Sekunde.
    liste.push({ spur, datei, bytes, sekunden: bytes ? (bytes - 44) / 176400 : 0 });
  }
  return liste;
}

async function loopExportieren(rolandPfad, nummer, spur, zielDatei) {
  const ordner = wavOrdner(rolandPfad, nummer, spur);
  const dateien = (await fsp.readdir(ordner)).filter(d => /\.wav$/i.test(d));
  if (!dateien.length) throw new Error('Diese Spur ist leer');
  await fsp.copyFile(path.join(ordner, dateien[0]), zielDatei);
  const groesse = (await fsp.stat(zielDatei)).size;
  return { datei: zielDatei, bytes: groesse };
}

// Prueft, ob eine WAV-Datei dem Format der Station entspricht.
async function wavPruefen(datei) {
  const griff = await fsp.open(datei, 'r');
  const puffer = Buffer.alloc(44);
  await griff.read(puffer, 0, 44, 0);
  await griff.close();
  if (puffer.toString('latin1', 0, 4) !== 'RIFF' || puffer.toString('latin1', 8, 12) !== 'WAVE') {
    return { passt: false, grund: 'Keine WAV-Datei' };
  }
  const kanaele = puffer.readUInt16LE(22);
  const rate = puffer.readUInt32LE(24);
  const bits = puffer.readUInt16LE(34);
  const passt = kanaele === 2 && rate === 44100 && bits === 16;
  return { passt, kanaele, rate, bits,
    grund: passt ? '' : 'Gebraucht wird 44100 Hertz, 16 Bit, Stereo' };
}

async function loopImportieren(rolandPfad, nummer, spur, quellDatei) {
  const pruefung = await wavPruefen(quellDatei);
  if (!pruefung.passt) throw new Error(pruefung.grund);
  const ordner = wavOrdner(rolandPfad, nummer, spur);
  await fsp.mkdir(ordner, { recursive: true });
  const zielName = String(nummer).padStart(3, '0') + '_' + spur + '.WAV';
  await fsp.copyFile(quellDatei, path.join(ordner, zielName));
  // Die Spur als belegt markieren, sonst spielt die Station sie nicht ab.
  const e = await wertSchreiben(rolandPfad, {
    datei: 'MEMORY', nummer, abschnitt: 'TRACK' + spur, feld: 'WavStat', wert: 1
  });
  return { datei: zielName, spurMarkiert: e.bestaetigt || !e.geaendert };
}

// =====================================================================
// Sicherung in Git
// =====================================================================

function gitSichern(text) {
  return new Promise((fertig) => {
    execFile('git', ['add', '-A'], { cwd: __dirname }, () => {
      execFile('git', ['commit', '-m', text], { cwd: __dirname }, (fehler, aus) => {
        if (fehler && /nothing to commit/.test(String(aus))) {
          fertig({ neu: false, meldung: 'Kein neuer Stand, nichts zu sichern.' });
        } else if (fehler) {
          fertig({ neu: false, meldung: 'Git meldet: ' + String(fehler.message).split(String.fromCharCode(10))[0] });
        } else {
          fertig({ neu: true, meldung: 'Stand in Git gesichert.' });
        }
      });
    });
  });
}

// =====================================================================
// Verbindung zur Oberflaeche
// =====================================================================

async function einstellungenEinlesen(rolandPfad) {
  const ziel = path.join(datenOrdner, 'DATA');
  await fsp.mkdir(ziel, { recursive: true });
  let bytes = 0;
  for (const datei of ['MEMORY.RC0', 'SYSTEM.RC0']) {
    const quelle = path.join(rolandPfad, 'DATA', datei);
    await fsp.copyFile(quelle, path.join(ziel, datei));
    bytes += (await fsp.stat(quelle)).size;
  }
  return { dateien: 2, bytes };
}

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
  const a = await zaehle(quelle), b = await zaehle(ziel);
  return { quelle: a, kopie: b, vollstaendig: a === b };
}

function sicher(fn) {
  return async (ereignis, ...rest) => {
    try { return { ok: true, ...(await fn(...rest)) }; }
    catch (fehler) { return { ok: false, fehler: String(fehler.message || fehler) }; }
  };
}

// Sehr schneller Blick, ob die Station als Laufwerk da ist. Bewusst nur
// Dateisystem, damit die Überwachung im Sekundentakt nichts kostet.
ipcMain.handle('laufwerk-da', sicher(async () => findeStation()));
ipcMain.handle('station-suchen', sicher(async () => findeStation()));
ipcMain.handle('kenndaten-lesen', sicher(kenndatenLesen));
ipcMain.handle('einstellungen-einlesen', sicher(einstellungenEinlesen));
ipcMain.handle('loops-einlesen', sicher(loopsEinlesen));
ipcMain.handle('speicherplaetze-lesen', sicher(async (p) => ({ plaetze: await speicherplaetzeLesen(p) })));
ipcMain.handle('speicherplatz-lesen', sicher(async (p, n) => ({ daten: await speicherplatzLesen(p, n) })));
ipcMain.handle('system-lesen', sicher(async (p) => ({ daten: await systemLesen(p) })));
ipcMain.handle('wert-schreiben', sicher(wertSchreiben));
ipcMain.handle('name-schreiben', sicher(nameSchreiben));
ipcMain.handle('platz-kopieren', sicher(platzKopieren));
ipcMain.handle('platz-tauschen', sicher(platzTauschen));
ipcMain.handle('loops-auflisten', sicher(async (p, n) => ({ spuren: await loopsAuflisten(p, n) })));
ipcMain.handle('loop-exportieren', sicher(loopExportieren));
ipcMain.handle('loop-importieren', sicher(loopImportieren));
// Steuert die USB-Verbindung zur Station, damit das Kabel stecken bleibt.
// aktion ist trennen, verbinden oder neuladen.
function usbSteuern(aktion) {
  return new Promise((fertig) => {
    const skript = path.join(__dirname, 'werkzeug', 'usb-steuern.ps1');
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', skript, '-Aktion', aktion],
      { windowsHide: true, timeout: 90000 },
      (fehler, aus) => {
        const text = String(aus || '');
        const lies = (schluessel) => {
          const treffer = new RegExp('^' + schluessel + '=(.*)$', 'm').exec(text);
          return treffer ? treffer[1].trim() : null;
        };
        fertig({
          geraet: lies('GEFUNDEN'),
          zustand: lies('ZUSTAND'),
          problem: lies('FEHLER') || (fehler ? String(fehler.message) : null)
        });
      });
  });
}

// Standard-Audiogeraete von Windows lesen und setzen.
function audioGeraete(aktion, suche, rolle) {
  return new Promise((fertig) => {
    const skript = path.join(__dirname, 'werkzeug', 'audio-geraete.ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', skript, '-Aktion', aktion];
    if (suche) args.push('-Suche', suche);
    if (rolle) args.push('-Rolle', rolle);
    execFile('powershell.exe', args, { windowsHide: true, timeout: 30000 }, (fehlerObj, aus) => {
      const text = String(aus || '');
      const problem = /^FEHLER=(.*)$/m.exec(text);
      const gesetzt = /^GESETZT=(.*)$/m.exec(text);
      const geraete = [];
      for (const zeile of text.split(/\r?\n/)) {
        const treffer = /^GERAET=(.*)$/.exec(zeile.trim());
        if (treffer) {
          const teile = treffer[1].split(';');
          geraete.push({ art: teile[0], name: teile[1], standard: teile[2] === 'ja' });
        }
      }
      fertig({
        geraete,
        gesetzt: gesetzt ? gesetzt[1].trim() : null,
        problem: problem ? problem[1].trim() : (fehlerObj ? String(fehlerObj.message) : null)
      });
    });
  });
}

ipcMain.handle('audio-geraete', sicher(audioGeraete));
ipcMain.handle('usb-steuern', sicher(usbSteuern));
ipcMain.handle('git-sichern', sicher(gitSichern));
ipcMain.handle('wav-schreiben', sicher(async (ziel, daten) => {
  await fsp.writeFile(ziel, Buffer.from(daten));
  return { bytes: (await fsp.stat(ziel)).size };
}));
ipcMain.handle('datenordner', sicher(async () => ({
  pfad: datenOrdner,
  vorhanden: fs.existsSync(path.join(datenOrdner, 'DATA', 'MEMORY.RC0'))
})));

ipcMain.handle('datei-waehlen', sicher(async (speichern, vorschlag) => {
  const e = speichern
    ? await dialog.showSaveDialog({ defaultPath: vorschlag, filters: [{ name: 'WAV', extensions: ['wav'] }] })
    : await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'WAV', extensions: ['wav'] }] });
  if (e.canceled) return { abgebrochen: true };
  return { abgebrochen: false, pfad: speichern ? e.filePath : e.filePaths[0] };
}));

app.whenReady().then(() => {
  erstelleFenster();

  // Nottaster: Strg und Punkt wirkt im ganzen System, auch wenn Sku505 nicht
  // im Vordergrund ist. Gedacht fuer den Fall, dass der Ton verschwindet und
  // der Rechner dadurch nicht mehr bedienbar waere.
  const angemeldet = globalShortcut.register('Control+.', () => {
    const fenster = BrowserWindow.getAllWindows()[0];
    if (!fenster) return;
    // Nach vorn holen, sonst liest die Sprachausgabe die Meldung nicht vor.
    if (fenster.isMinimized()) fenster.restore();
    fenster.show();
    fenster.focus();
    fenster.webContents.send('nottaster');
  });
  if (!angemeldet) console.log('Strg Punkt konnte nicht angemeldet werden');
  // Der Renderer fragt nach, ob die Taste wirklich liegt. Ein blinder Nutzer
  // darf sich nicht auf einen Nottaster verlassen, den ein anderes Programm
  // schon belegt hat.
  ipcMain.handle('nottaster-liegt', () => angemeldet);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => app.quit());
