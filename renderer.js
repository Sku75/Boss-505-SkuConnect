// Sku505 Version 0.07, Werkstatt mit Tooltip und kurzen Ansagen.
//
// Bedienung: Pfeil hoch und runter wandern innerhalb der Ebene, Pfeil rechts
// geht hinein, Pfeil links und Rücktaste gehen heraus, Enter aktiviert.
// Pos 1 und Ende springen an den Rand der Ebene, dort erklingt der Anschlagton.
//
// Grundregeln:
//  - Ein Ladeknopf bleibt stehen und behält den Fokus, Ergebnisse darunter.
//  - Große Listen werden erst beim Öffnen gebaut, damit nichts hakt.
//  - Geschrieben wird nur, was in felder.js beschrieben ist. Jeder Schreibvorgang
//    sichert vorher den Stand und liest danach zur Kontrolle zurück.

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");
const eingabefeld = document.getElementById("eingabefeld");

let stationsPfad = null;   // Pfad zum ROLAND-Ordner
let schreibbar = false;    // nur wahr, wenn die echte Station verbunden ist

// Ansagen sind bewusst kurz und bühnentauglich. Die Einzelheiten stehen im
// Tooltip, den man mit Shift und Pfeil runter öffnet.
//
// Wichtig: Die Statuszeile meldet nur Änderungen. Bei zweimal demselben Text
// bliebe die Sprachausgabe sonst stumm. Darum wird sie erst geleert und der
// Text danach neu gesetzt.
function sage(text) {
  statuszeile.textContent = "";
  window.setTimeout(() => { statuszeile.textContent = text; }, 40);
}

// Kurze Ansage plus Einzelheiten, die am Menüpunkt hängen bleiben und
// später über den Tooltip nachlesbar sind.
function ergebnis(li, ansage, zeilen) {
  if (li) li._ergebnis = zeilen && zeilen.length ? zeilen : [ansage];
  sage(ansage);
}

// --- Anschlagton, erzeugt wie in Skularis: 220 Hertz, 400 Millisekunden ---

let audioKontext = null;
function spieleAnschlag() {
  if (!audioKontext) audioKontext = new (window.AudioContext || window.webkitAudioContext)();
  const oszillator = audioKontext.createOscillator();
  const pegel = audioKontext.createGain();
  oszillator.frequency.value = 220;
  oszillator.connect(pegel);
  pegel.connect(audioKontext.destination);
  const jetzt = audioKontext.currentTime;
  pegel.gain.setValueAtTime(0.3, jetzt);
  pegel.gain.exponentialRampToValueAtTime(0.001, jetzt + 0.4);
  oszillator.start(jetzt);
  oszillator.stop(jetzt + 0.4);
}

// =====================================================================
// Tooltip: Shift halten und Pfeil runter
//
// Zeigt zum Menüpunkt unter dem Fokus die Einzelheiten: bei einer Aktion
// das letzte Ergebnis, bei einem Wert den aktuellen Stand und die möglichen
// Werte. Solange Shift gehalten wird, wandert man mit Pfeil runter und hoch
// durch die Zeilen. Beim Loslassen von Shift schließt sich der Tooltip.
// =====================================================================

const tooltip = document.getElementById("tooltip");
let tooltipOffen = false;
let tooltipRueckkehr = null;

// Stellt die Zeilen zusammen, die zu einem Menüpunkt gehören.
function tooltipZeilen(li) {
  if (li.dataset.typ === "wert") {
    const b = li._beschreibung || {};
    const zeilen = ["Aktuell: " + wertText(li.dataset.art, li.dataset.rohwert, b)];
    if (b.nurLesen) {
      zeilen.push("Lässt sich hier nicht ändern");
    } else {
      for (const o of auswahlBauen(li.dataset.art, b)) {
        zeilen.push(String(o.wert) === String(li.dataset.rohwert) ? o.text + ", eingestellt" : o.text);
      }
    }
    return zeilen;
  }
  return li._ergebnis || null;
}

function oeffneTooltip(li) {
  const zeilen = tooltipZeilen(li);
  if (!zeilen || !zeilen.length) { sage("Keine weiteren Angaben."); return false; }

  tooltip.innerHTML = "";
  const kopf = document.createElement("li");
  kopf.className = "kopf";
  kopf.textContent = li.dataset.text;
  kopf.tabIndex = -1;
  tooltip.appendChild(kopf);
  for (const z of zeilen) {
    const zeile = document.createElement("li");
    zeile.textContent = z;
    zeile.tabIndex = -1;
    tooltip.appendChild(zeile);
  }
  tooltip.hidden = false;
  tooltipOffen = true;
  tooltipRueckkehr = li;
  tooltip.children[1].focus();
  return true;
}

function tooltipWeiter(richtung) {
  const zeilen = Array.from(tooltip.children);
  const jetzt = zeilen.indexOf(document.activeElement);
  const ziel = jetzt + richtung;
  if (ziel < 1 || ziel >= zeilen.length) { spieleAnschlag(); return; }
  zeilen[ziel].focus();
}

function schliesseTooltip() {
  if (!tooltipOffen) return;
  tooltip.hidden = true;
  tooltipOffen = false;
  if (tooltipRueckkehr) fokussiere(tooltipRueckkehr);
  tooltipRueckkehr = null;
}

// In der Erfassungsphase, damit die Pfeil-Navigation des Menüs diese
// Kombination nicht ebenfalls verarbeitet.
document.addEventListener("keydown", (e) => {
  if (!e.shiftKey) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if (!eingabefeld.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;

  if (!tooltipOffen) {
    const li = document.activeElement;
    if (!li || li.getAttribute("role") !== "treeitem") return;
    oeffneTooltip(li);
    return;
  }
  tooltipWeiter(e.key === "ArrowDown" ? 1 : -1);
}, true);

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" && tooltipOffen) schliesseTooltip();
}, true);

// =====================================================================
// Werte darstellen und Auswahllisten erzeugen
// =====================================================================

function wertText(art, roh, beschreibung) {
  const zahl = parseInt(roh, 10);
  if (art === "liste") {
    const w = beschreibung.werte || [];
    return w[zahl] !== undefined ? w[zahl] : String(roh);
  }
  if (art === "tempo") return String((zahl / 10).toFixed(1)).replace(".", ",") + " BPM";
  if (art === "looplaenge") return zahl === 0 ? "AUTO" : zahl + (zahl === 1 ? " Takt" : " Takte");
  return String(roh);
}

function auswahlBauen(art, beschreibung) {
  const liste = [];
  if (art === "liste") {
    (beschreibung.werte || []).forEach((t, i) => liste.push({ wert: i, text: t }));
  } else if (art === "tempo") {
    for (let bpm = 40; bpm <= 250; bpm++) liste.push({ wert: bpm * 10, text: bpm + " BPM" });
  } else if (art === "looplaenge") {
    liste.push({ wert: 0, text: "AUTO" });
    for (let t = 1; t <= 32; t++) liste.push({ wert: t, text: t + (t === 1 ? " Takt" : " Takte") });
  } else {
    const min = beschreibung.min !== undefined ? beschreibung.min : 0;
    const max = beschreibung.max !== undefined ? beschreibung.max : 100;
    for (let z = min; z <= max; z++) liste.push({ wert: z, text: String(z) });
  }
  return liste;
}

// =====================================================================
// Baum aufbauen
// =====================================================================

function neuerEintrag(eintrag, ebene) {
  const li = document.createElement("li");
  li.setAttribute("role", "treeitem");
  li.setAttribute("aria-level", String(ebene));
  li.dataset.typ = eintrag.typ;
  if (eintrag.id) li.dataset.id = eintrag.id;
  li.tabIndex = -1;

  const zeile = document.createElement("span");
  zeile.className = "zeile";
  li.appendChild(zeile);

  // Zusatzangaben übernehmen, etwa Speicherplatz, Abschnitt und Feld.
  for (const schluessel of ["datei", "nummer", "abschnitt", "feld", "rohwert", "art", "spur", "laden", "ziel"]) {
    if (eintrag[schluessel] !== undefined) li.dataset[schluessel] = eintrag[schluessel];
  }
  if (eintrag.beschreibung) li._beschreibung = eintrag.beschreibung;
  if (eintrag.tun) li._tun = eintrag.tun;

  // Eine Unterebene bekommt nur, wer auch wirklich eine hat. Ein Wert, der
  // sich nicht ändern lässt, bleibt darum ohne Auswahlliste.
  const hatUnterebene = eintrag.typ === "ordner" || (eintrag.typ === "wert" && eintrag.laden);
  if (hatUnterebene) {
    li.setAttribute("aria-expanded", "false");
    const gruppe = document.createElement("ul");
    gruppe.setAttribute("role", "group");
    gruppe.hidden = true;
    li.appendChild(gruppe);
    if (eintrag.kinder) baueEbene(eintrag.kinder, gruppe, ebene + 1);
  }

  li.dataset.text = eintrag.text;
  aktualisiereZeile(li);
  return li;
}

function baueEbene(eintraege, elternListe, ebene) {
  for (const eintrag of eintraege) elternListe.appendChild(neuerEintrag(eintrag, ebene));
}

function setzeKinder(li, eintraege) {
  const gruppe = li.querySelector(':scope > ul[role="group"]');
  gruppe.innerHTML = "";
  const ebene = parseInt(li.getAttribute("aria-level"), 10) + 1;
  baueEbene(eintraege, gruppe, ebene);
  li.dataset.geladen = "ja";
}

// Grundregel: Der Ladeknopf bleibt an erster Stelle und behält den Fokus.
function zeigeErgebnisse(ordner, ladeEintrag, ergebnisse) {
  setzeKinder(ordner, [ladeEintrag].concat(ergebnisse));
  oeffne(ordner);
  fokussiere(ordner.querySelector(':scope > ul[role="group"] > li'));
}

function aktualisiereZeile(li) {
  const zeile = li.querySelector(":scope > .zeile");
  if (li.dataset.typ === "wert") {
    const text = wertText(li.dataset.art, li.dataset.rohwert, li._beschreibung || {});
    zeile.textContent = li.dataset.text + ": " + text;
  } else {
    zeile.textContent = li.dataset.text;
  }
}

// =====================================================================
// Navigation
// =====================================================================

function ebenenEintraege(li) {
  return Array.from(li.parentElement.children).filter(e => e.getAttribute("role") === "treeitem");
}

function fokussiere(li) {
  if (!li) return;
  baumElement.querySelectorAll('li[role="treeitem"]').forEach(e => e.tabIndex = -1);
  li.tabIndex = 0;
  li.focus();
}

function oeffne(li) {
  const gruppe = li.querySelector(':scope > ul[role="group"]');
  if (!gruppe) return false;
  li.setAttribute("aria-expanded", "true");
  gruppe.hidden = false;
  return true;
}

function schliesse(li) {
  const gruppe = li.querySelector(':scope > ul[role="group"]');
  if (!gruppe) return false;
  li.setAttribute("aria-expanded", "false");
  gruppe.hidden = true;
  return true;
}

function elternVon(li) {
  const elternListe = li.parentElement;
  if (elternListe && elternListe.getAttribute("role") === "group") return elternListe.parentElement;
  return null;
}

function ebeneZurueck(aktiv) {
  if (aktiv.getAttribute("aria-expanded") === "true") { schliesse(aktiv); return; }
  const eltern = elternVon(aktiv);
  if (eltern) { schliesse(eltern); fokussiere(eltern); }
  else spieleAnschlag();
}

// Öffnet einen Eintrag und lädt bei Bedarf vorher seinen Inhalt.
async function hineingehen(li) {
  if (!li.hasAttribute("aria-expanded")) { spieleAnschlag(); return; }
  if (li.dataset.laden && li.dataset.geladen !== "ja") {
    const fertig = await laden(li);
    if (!fertig) return;
    // Auswahllisten setzen den Fokus selbst auf den gerade gültigen Wert.
    if (fertig === "fokussiert") return;
  }
  oeffne(li);
  const erstes = li.querySelector(':scope > ul[role="group"] > li');
  if (erstes) fokussiere(erstes); else spieleAnschlag();
}

// =====================================================================
// Quelle der Daten
// =====================================================================

async function quelleSichern() {
  if (stationsPfad) return stationsPfad;
  const e = await window.sku505.stationSuchen();
  if (e.gefunden) { stationsPfad = e.rolandPfad; schreibbar = true; return stationsPfad; }
  const eigen = await window.sku505.datenordner();
  if (eigen.ok && eigen.vorhanden) { stationsPfad = eigen.pfad; schreibbar = false; return stationsPfad; }
  return null;
}

// =====================================================================
// Inhalte nachladen
// =====================================================================

async function laden(li) {
  const art = li.dataset.laden;
  const pfad = await quelleSichern();
  if (!pfad) { sage("Keine Daten, erst Station suchen"); return false; }

  if (art === "platz") {
    sage("Lese Speicherplatz " + li.dataset.nummer + "...");
    const e = await window.sku505.speicherplatzLesen(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, platzEintraege(e.daten));
    sage(li.dataset.text);
    return true;
  }

  if (art === "wertoptionen") {
    const liste = auswahlBauen(li.dataset.art, li._beschreibung || {});
    const jetzt = String(li.dataset.rohwert);
    setzeKinder(li, liste.map(o => ({
      typ: "option", text: o.text, ziel: o.wert,
      id: "opt-" + o.wert
    })));
    // Auf den aktuell gültigen Wert springen, damit man sieht, wo man steht.
    const gruppe = li.querySelector(':scope > ul[role="group"]');
    const treffer = Array.from(gruppe.children).find(k => k.dataset.ziel === jetzt);
    if (treffer) { oeffne(li); fokussiere(treffer); return "fokussiert"; }
    return true;
  }

  if (art === "loops") {
    const e = await window.sku505.loopsAuflisten(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, e.spuren.map(s => ({
      typ: "ordner", text: "Spur " + s.spur + ": " + (s.datei ? s.sekunden.toFixed(1).replace(".", ",") + " Sekunden" : "leer"),
      nummer: li.dataset.nummer, spur: s.spur,
      kinder: [
        { typ: "aktion", id: "loop-export", text: "Aufnahme exportieren", nummer: li.dataset.nummer, spur: s.spur },
        { typ: "aktion", id: "loop-import", text: "WAV-Datei einspielen", nummer: li.dataset.nummer, spur: s.spur }
      ]
    })));
    return true;
  }

  if (art === "system") {
    const e = await window.sku505.systemLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const eintraege = [];
    for (const abschnitt of Object.keys(e.daten)) {
      eintraege.push({
        typ: "ordner", text: abschnittName(abschnitt),
        kinder: felderZuEintraegen("SYSTEM", 0, abschnitt, e.daten[abschnitt])
      });
    }
    setzeKinder(li, eintraege);
    return true;
  }

  if (art === "zielplatz") {
    const eintraege = [];
    for (let n = 1; n <= 99; n++) {
      eintraege.push({ typ: "aktion", id: li.dataset.id, text: "Platz " + String(n).padStart(2, "0"),
        nummer: li.dataset.nummer, ziel: n });
    }
    setzeKinder(li, eintraege);
    return true;
  }

  return false;
}

function abschnittName(abschnitt) {
  const namen = {
    SETUP: "Grundeinstellungen", INPUT_OUTPUT: "Ein- und Ausgang",
    USB: "USB", MIDI: "MIDI", MASTER: "Speicherplatz gesamt",
    REC_OPTION: "Aufnahme", PLAY_OPTION: "Wiedergabe", RHYTHM: "Rhythmus",
    INPUT_FX: "Input FX", TRACK_FX: "Track FX"
  };
  if (namen[abschnitt]) return namen[abschnitt];
  if (/^TRACK[1-5]$/.test(abschnitt)) return "Spur " + abschnitt.slice(5);
  if (/^ASSIGN(\d+)$/.test(abschnitt)) return "Zuweisung " + abschnitt.slice(6);
  if (/^INPUT_FX([123])$/.test(abschnitt)) return "Input FX, Parameter Taste " + "ABC"[abschnitt.slice(8) - 1];
  if (/^TRACK_FX([123])$/.test(abschnitt)) return "Track FX, Parameter Taste " + "ABC"[abschnitt.slice(8) - 1];
  return abschnitt;
}

// Wandelt die Felder eines Abschnitts in Menüeinträge um.
function felderZuEintraegen(datei, nummer, abschnitt, werte) {
  const eintraege = [];
  for (const feld of Object.keys(werte)) {
    const b = feldBeschreibung(abschnitt, feld);
    if (b) {
      eintraege.push({
        typ: "wert", text: b.text, art: b.art || "zahl",
        datei, nummer, abschnitt, feld, rohwert: werte[feld],
        beschreibung: b, laden: b.nurLesen ? undefined : "wertoptionen",
        id: b.nurLesen ? "nur-lesen" : "wert"
      });
    } else {
      // Unbekanntes Feld: ehrlich anzeigen, aber nicht änderbar.
      eintraege.push({
        typ: "aktion", id: "nur-lesen",
        text: feld + ": " + werte[feld]
      });
    }
  }
  return eintraege;
}

// Baut den Inhalt eines Speicherplatzes.
function platzEintraege(daten) {
  const n = daten.nummer;
  const eintraege = [];

  eintraege.push({ typ: "aktion", id: "name-aendern", text: "Name: " + daten.name.trim(), nummer: n });

  for (const a of ["PLAY_OPTION", "REC_OPTION", "MASTER", "RHYTHM"]) {
    eintraege.push({ typ: "ordner", text: abschnittName(a),
      kinder: felderZuEintraegen("MEMORY", n, a, daten[a]) });
  }

  for (let s = 1; s <= 5; s++) {
    eintraege.push({ typ: "ordner", text: abschnittName("TRACK" + s),
      kinder: felderZuEintraegen("MEMORY", n, "TRACK" + s, daten["TRACK" + s]) });
  }

  for (const bank of ["INPUT_FX", "TRACK_FX"]) {
    const kinder = felderZuEintraegen("MEMORY", n, bank, daten[bank]);
    for (let i = 1; i <= 3; i++) {
      const teil = bank + i;
      kinder.push({ typ: "ordner", text: abschnittName(teil),
        kinder: felderZuEintraegen("MEMORY", n, teil, daten[teil]) });
    }
    eintraege.push({ typ: "ordner", text: abschnittName(bank), kinder });
  }

  const zuweisungen = [];
  for (let i = 1; i <= 16; i++) {
    zuweisungen.push({ typ: "ordner", text: abschnittName("ASSIGN" + i),
      kinder: felderZuEintraegen("MEMORY", n, "ASSIGN" + i, daten["ASSIGN" + i]) });
  }
  eintraege.push({ typ: "ordner", text: "Zuweisungen, 16 Stück", kinder: zuweisungen });

  eintraege.push({ typ: "ordner", text: "Loop-Aufnahmen", nummer: n, laden: "loops" });
  eintraege.push({ typ: "ordner", text: "Einstellungen kopieren auf", nummer: n, laden: "zielplatz", id: "kopieren-nach" });
  eintraege.push({ typ: "ordner", text: "Einstellungen tauschen mit", nummer: n, laden: "zielplatz", id: "tauschen-mit" });

  return eintraege;
}

// =====================================================================
// Aktionen
// =====================================================================

async function stationSuchen(li) {
  const e = await window.sku505.stationSuchen();
  if (e.gefunden) {
    stationsPfad = e.rolandPfad; schreibbar = true;
    ergebnis(li, "Station gefunden, Laufwerk " + e.laufwerk, [
      "Station gefunden", "Laufwerk " + e.laufwerk, "Ändern möglich"
    ]);
    return;
  }
  const eigen = await window.sku505.datenordner();
  if (eigen.ok && eigen.vorhanden) {
    stationsPfad = eigen.pfad; schreibbar = false;
    ergebnis(li, "Keine Station, nur Lesen", [
      "Keine Station angeschlossen", "Arbeite mit dem eingelesenen Stand", "Ändern nicht möglich"
    ]);
    return;
  }
  stationsPfad = null; schreibbar = false;
  ergebnis(li, "Keine Station gefunden", [
    "Keine Station gefunden", "Sie muss im Speicher-Modus angeschlossen sein",
    "Am Gerät: SYSTEM drei Mal, Regler auf STORAGE, EXIT, Kabel neu stecken"
  ]);
}

async function firmwarePruefen(li) {
  const p = await quelleSichern();
  if (!p) { ergebnis(li, "Keine Daten vorhanden", null); return; }
  const e = await window.sku505.kenndatenLesen(p);
  if (!e.ok) { ergebnis(li, "Fehler beim Lesen", ["Fehler", e.fehler]); return; }
  const fw = e.revision === "2" ? "Firmware 2.0" : "Firmware unbekannt";
  ergebnis(li, e.geraet + ", " + fw, [
    "Gerät " + e.geraet, fw, "Datenstand " + e.revision,
    schreibbar ? "Ändern möglich" : "Nur Lesen"
  ]);
}

async function speicherplaetzeLaden(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten, erst Station suchen"); return; }
  sage("Lese Speicherplätze...");
  const e = await window.sku505.speicherplaetzeLesen(p);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }

  const ordner = elternVon(li);
  const eintraege = e.plaetze.map(pl => {
    const laenge = pl.lpLen === 0 ? "AUTO" : pl.lpLen + " Takte";
    const spuren = pl.spuren === 0 ? "leer" : pl.spuren + " Spuren";
    return {
      typ: "ordner",
      text: String(pl.nummer).padStart(2, "0") + " " + pl.name.trim() + ", " + laenge + ", " + spuren,
      nummer: pl.nummer, laden: "platz"
    };
  });
  zeigeErgebnisse(ordner, { typ: "aktion", id: "platz-laden", text: "Speicherplätze laden" }, eintraege);
  const belegteListe = e.plaetze.filter(x => x.spuren > 0);
  const neuerKnopf = ordner.querySelector(':scope > ul[role="group"] > li');
  ergebnis(neuerKnopf, e.plaetze.length + " Plätze, " + belegteListe.length + " belegt",
    [e.plaetze.length + " Speicherplätze", belegteListe.length + " davon belegt"].concat(
      belegteListe.map(x => "Platz " + x.nummer + ", " + x.name.trim() + ", " + x.spuren + " Spuren")));
}

// Schreibt einen gewählten Wert und meldet das Ergebnis.
async function wertSetzen(optionLi) {
  const wertLi = elternVon(optionLi);
  if (!schreibbar) {
    sage("Nur Lesen, Station nicht verbunden");
    return;
  }
  const neu = optionLi.dataset.ziel;
  const auftrag = {
    datei: wertLi.dataset.datei,
    nummer: parseInt(wertLi.dataset.nummer, 10),
    abschnitt: wertLi.dataset.abschnitt,
    feld: wertLi.dataset.feld,
    wert: neu
  };
  const b = wertLi._beschreibung || {};
  const alterText = wertText(wertLi.dataset.art, wertLi.dataset.rohwert, b);
  const e = await window.sku505.wertSchreiben(stationsPfad, auftrag);
  if (!e.ok) { ergebnis(wertLi, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }

  if (!e.geaendert) {
    ergebnis(wertLi, "Steht schon auf " + optionLi.dataset.text, null);
  } else if (e.bestaetigt) {
    wertLi.dataset.rohwert = neu;
    aktualisiereZeile(wertLi);
    ergebnis(wertLi, wertLi.dataset.text + " geändert auf " + optionLi.dataset.text, [
      wertLi.dataset.text, "Jetzt: " + optionLi.dataset.text, "Vorher: " + alterText,
      "Zurückgelesen und geprüft"
    ]);
  } else {
    ergebnis(wertLi, "Achtung, Kontrolle fehlgeschlagen", [
      "Die Kontrolle nach dem Schreiben hat nicht gestimmt",
      "Gewünscht: " + neu, "Gelesen: " + e.gelesen,
      "Den Wert am Gerät prüfen"
    ]);
    return;
  }
  schliesse(wertLi);
  wertLi.dataset.geladen = "";
  fokussiere(wertLi);
}

// Kleines Eingabefeld für Freitext, etwa den Namen.
function frageText(beschriftung, vorgabe) {
  return new Promise((fertig) => {
    eingabefeld.value = vorgabe || "";
    eingabefeld.setAttribute("aria-label", beschriftung + ", Enter bestätigt, Escape bricht ab");
    eingabefeld.hidden = false;
    eingabefeld.focus();
    eingabefeld.select();
    sage(beschriftung + ". Eingeben, dann Enter. Escape bricht ab.");
    function ende(wert) {
      eingabefeld.hidden = true;
      eingabefeld.removeEventListener("keydown", taste);
      fertig(wert);
    }
    function taste(ereignis) {
      if (ereignis.key === "Enter") { ereignis.preventDefault(); ende(eingabefeld.value); }
      else if (ereignis.key === "Escape") { ereignis.preventDefault(); ende(null); }
      ereignis.stopPropagation();
    }
    eingabefeld.addEventListener("keydown", taste);
  });
}

async function nameAendern(li) {
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }
  const alt = li.dataset.text.replace(/^Name: /, "");
  const neu = await frageText("Neuer Name, höchstens 12 Zeichen", alt);
  fokussiere(li);
  if (neu === null) { sage("Abgebrochen"); return; }
  const e = await window.sku505.nameSchreiben(stationsPfad, parseInt(li.dataset.nummer, 10), neu);
  if (!e.ok) { ergebnis(li, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }
  li.dataset.text = "Name: " + e.name;
  aktualisiereZeile(li);
  ergebnis(li, "Name geändert auf " + e.name,
    ["Name geändert", "Jetzt: " + e.name, "Vorher: " + alt, "Zurückgelesen und geprüft"]);
}

async function platzUebertragen(optionLi, tauschen) {
  if (!schreibbar) { sage("Nur Lesen möglich. Station nicht im Speicher-Modus verbunden."); return; }
  const von = parseInt(optionLi.dataset.nummer, 10);
  const nach = parseInt(optionLi.dataset.ziel, 10);
  if (von === nach) { sage("Quelle und Ziel sind derselbe Platz."); return; }
  const e = tauschen
    ? await window.sku505.platzTauschen(stationsPfad, von, nach)
    : await window.sku505.platzKopieren(stationsPfad, von, nach);
  if (!e.ok) { ergebnis(optionLi, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.bestaetigt) {
    ergebnis(optionLi, (tauschen ? "Getauscht mit Platz " : "Kopiert auf Platz ") + nach, [
      (tauschen ? "Getauscht" : "Kopiert"), "Von Platz " + von, "Nach Platz " + nach,
      "Nur die Einstellungen", "Die Loop-Aufnahmen bleiben liegen", "Zurückgelesen und geprüft"
    ]);
  } else {
    ergebnis(optionLi, "Achtung, Kontrolle fehlgeschlagen",
      ["Die Kontrolle nach dem Schreiben hat nicht gestimmt", "Den Platz am Gerät prüfen"]);
  }
}

async function loopExportieren(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten vorhanden."); return; }
  const vorschlag = "Platz" + String(li.dataset.nummer).padStart(2, "0") + "_Spur" + li.dataset.spur + ".wav";
  const wahl = await window.sku505.dateiWaehlen(true, vorschlag);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }
  const e = await window.sku505.loopExportieren(p, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { ergebnis(li, "Fehler beim Export", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Exportiert, " + Math.round(e.bytes / 1024) + " Kilobyte",
    ["Export fertig", Math.round(e.bytes / 1024) + " Kilobyte", "Datei: " + wahl.pfad]);
}

async function loopImportieren(li) {
  if (!schreibbar) { sage("Nur Lesen möglich. Station nicht im Speicher-Modus verbunden."); return; }
  const wahl = await window.sku505.dateiWaehlen(false);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }
  sage("Spiele Datei ein");
  const e = await window.sku505.loopImportieren(stationsPfad, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { ergebnis(li, "Einspielen nicht möglich", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Eingespielt auf Spur " + li.dataset.spur,
    ["Eingespielt", "Spur " + li.dataset.spur, "Datei: " + e.datei, "Liste neu laden zeigt die Länge"]);
}

async function einstellungenEinlesen(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Station gefunden."); return; }
  sage("Lese Einstellungen ein...");
  const e = await window.sku505.einstellungenEinlesen(p);
  if (!e.ok) { ergebnis(li, "Fehler beim Einlesen", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Einstellungen eingelesen",
    ["Einstellungen eingelesen", Math.round(e.bytes / 1024) + " Kilobyte", "2 Dateien"]);
}

async function loopsEinlesen(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Station gefunden."); return; }
  sage("Lese Loop-Aufnahmen ein. Das dauert, das Menü bleibt bedienbar.");
  const e = await window.sku505.loopsEinlesen(p);
  if (!e.ok) { ergebnis(li, "Fehler beim Einlesen", ["Fehler", e.fehler]); return; }
  if (e.vollstaendig) {
    ergebnis(li, "Loops eingelesen, " + e.kopie + " Dateien",
      ["Loop-Aufnahmen eingelesen", e.kopie + " Dateien", "Vollständig"]);
  } else {
    ergebnis(li, "Achtung, unvollständig",
      ["Unvollständig eingelesen", "Quelle " + e.quelle + " Dateien", "Kopie " + e.kopie + " Dateien"]);
  }
}

async function inGitSichern(li) {
  const e = await window.sku505.gitSichern("Stationsdaten gesichert");
  if (!e.ok) { ergebnis(li, "Fehler beim Sichern", ["Fehler", e.fehler]); return; }
  ergebnis(li, e.neu ? "In Git gesichert" : "Nichts Neues zu sichern", [e.meldung]);
}

// =====================================================================
// Menü
// =====================================================================

const menue = [
  { typ: "ordner", text: "Werkstatt", kinder: [
    { typ: "aktion", id: "station-suchen", text: "Station suchen" },
    { typ: "aktion", id: "firmware", text: "Firmware und Datenstand prüfen" },
    { typ: "ordner", text: "Speicherplätze", kinder: [
      { typ: "aktion", id: "platz-laden", text: "Speicherplätze laden" }
    ]},
    { typ: "ordner", text: "Systemeinstellungen der Station", laden: "system" },
    { typ: "ordner", text: "Einlesen und sichern", kinder: [
      { typ: "aktion", id: "einst-einlesen", text: "Einstellungen einlesen, schnell" },
      { typ: "aktion", id: "loops-einlesen", text: "Loop-Aufnahmen einlesen, dauert lange" },
      { typ: "aktion", id: "git-sichern", text: "Stand in Git sichern" }
    ]}
  ]},
  { typ: "ordner", text: "Live-Studio", kinder: [
    { typ: "aktion", id: "live-info", text: "Wird in einer späteren Stufe gebaut" }
  ]},
  { typ: "ordner", text: "Optionen", kinder: [
    { typ: "aktion", id: "ueber", text: "Über Sku505" }
  ]},
  { typ: "aktion", id: "beenden", text: "Sku505 beenden" }
];

// =====================================================================
// Tastensteuerung
// =====================================================================

async function aktiviere(li) {
  const typ = li.dataset.typ;
  if (typ === "ordner" || typ === "wert") { await hineingehen(li); return; }
  if (typ === "option") { await wertSetzen(li); return; }

  switch (li.dataset.id) {
    case "beenden": window.close(); return;
    case "ueber": sage("Sku505 Version 0.07"); return;
    case "station-suchen": await stationSuchen(li); return;
    case "firmware": await firmwarePruefen(li); return;
    case "platz-laden": await speicherplaetzeLaden(li); return;
    case "einst-einlesen": await einstellungenEinlesen(li); return;
    case "loops-einlesen": await loopsEinlesen(li); return;
    case "git-sichern": await inGitSichern(li); return;
    case "name-aendern": await nameAendern(li); return;
    case "kopieren-nach": await platzUebertragen(li, false); return;
    case "tauschen-mit": await platzUebertragen(li, true); return;
    case "loop-export": await loopExportieren(li); return;
    case "loop-import": await loopImportieren(li); return;
    case "nur-lesen": sage("Lässt sich hier nicht ändern"); return;
    default: sage(li.dataset.text); return;
  }
}

baumElement.addEventListener("keydown", async (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || aktiv.getAttribute("role") !== "treeitem") return;
  const ebene = ebenenEintraege(aktiv);
  const index = ebene.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      if (index >= ebene.length - 1) spieleAnschlag(); else fokussiere(ebene[index + 1]);
      break;
    case "ArrowUp":
      ereignis.preventDefault();
      if (index <= 0) spieleAnschlag(); else fokussiere(ebene[index - 1]);
      break;
    case "Home":
      ereignis.preventDefault();
      if (index === 0) spieleAnschlag();
      fokussiere(ebene[0]);
      break;
    case "End":
      ereignis.preventDefault();
      if (index === ebene.length - 1) spieleAnschlag();
      fokussiere(ebene[ebene.length - 1]);
      break;
    case "ArrowRight":
      ereignis.preventDefault();
      await hineingehen(aktiv);
      break;
    case "ArrowLeft":
    case "Backspace":
      ereignis.preventDefault();
      ebeneZurueck(aktiv);
      break;
    case "Enter":
      ereignis.preventDefault();
      await aktiviere(aktiv);
      break;
  }
});

baueEbene(menue, baumElement, 1);
fokussiere(baumElement.querySelector('li[role="treeitem"]'));
sage("Sku505 bereit.");
