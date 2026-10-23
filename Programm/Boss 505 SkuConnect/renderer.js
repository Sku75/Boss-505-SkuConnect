// Boss 505 SkuConnect Version 0.45, Werkstatt und Live-Studio.
//
// Bedienung:
//   Pfeil hoch und runter   wandern innerhalb der Ebene
//   Pfeil rechts            geht eine Ebene hinein
//   Pfeil links, Rücktaste  geht eine Ebene zurück
//   Enter                   aktiviert
//   Pos 1, Ende             an den Rand der Ebene
//   Shift und Pfeil runter  Tooltip mit den Einzelheiten
//   Buchstaben              Menüfilter, Escape hebt ihn auf
//
// Gesprochen wird nur, worauf der Fokus steht. Den Ebenenwechsel meldet ein
// Ton, nicht die Sprachausgabe. Darum trägt das Menü die Rolle application
// und die Zeilen sind Schaltflächen, genau wie in Skularis.

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");
const eingabefeld = document.getElementById("eingabefeld");

let stationsPfad = null;   // Pfad zum ROLAND-Ordner
let gewaehlterPlatz = null;  // zuletzt mit Enter gewählter Speicherplatz
let schreibbar = false;    // nur wahr, wenn die echte Station verbunden ist

// =====================================================================
// Ansagen
// =====================================================================

// Kurz und bühnentauglich. Die Einzelheiten stehen im Tooltip.
// Die Statuszeile meldet nur Änderungen, darum wird sie erst geleert.
// Ein wechselndes Leerzeichen am Ende sorgt dafür, dass die Statuszeile sich
// auch dann ändert, wenn derselbe Text noch einmal kommt. Sonst bliebe die
// Sprachausgabe stumm. Hörbar ist der Unterschied nicht.
let ansageWechsel = false;
function sage(text) {
  ansageWechsel = !ansageWechsel;
  statuszeile.textContent = ansageWechsel ? text + " " : text;
}

function ergebnis(li, ansage, zeilen) {
  if (li) li._ergebnis = zeilen && zeilen.length ? zeilen : [ansage];
  sage(ansage);
}

// =====================================================================
// Klänge
// =====================================================================

const KLAENGE = {
  ebeneVor:     new Audio("assets/sounds/ebene-vor.wav"),
  ebeneZurueck: new Audio("assets/sounds/ebene-zurueck.wav"),
  tooltipAuf:   new Audio("assets/sounds/tooltip-auf.ogg"),
  tooltipZu:    new Audio("assets/sounds/tooltip-zu.ogg")
};
// Die Ebenen-Töne bewusst leise, sie erklingen bei jedem Schritt.
KLAENGE.ebeneVor.volume = 0.25;
KLAENGE.ebeneZurueck.volume = 0.25;
KLAENGE.tooltipAuf.volume = 0.5;
KLAENGE.tooltipZu.volume = 0.5;

let audioKontext = null;

function klang(name) {
  if (name === "hauptmenue") { spieleHauptmenue(); return; }
  const k = KLAENGE[name];
  if (!k) return;
  try { k.currentTime = 0; k.play(); } catch { /* egal */ }
}

// Hauptmenü: ein eigener, klar abgesetzter Zweiklang. Bewusst erzeugt und
// nicht aus einer Datei, damit er keinem Klang der Sprachausgabe ähnelt.
function spieleHauptmenue() {
  if (!audioKontext) audioKontext = new (window.AudioContext || window.webkitAudioContext)();
  const start = audioKontext.currentTime;
  [[660, 0], [440, 0.14]].forEach(([hz, versatz]) => {
    const o = audioKontext.createOscillator();
    const g = audioKontext.createGain();
    o.type = "triangle";
    o.frequency.value = hz;
    o.connect(g); g.connect(audioKontext.destination);
    const t0 = start + versatz;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.start(t0); o.stop(t0 + 0.24);
  });
}

// Anschlag am Rand einer Ebene: erzeugter Ton, 220 Hertz, wie in Skularis.
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
// Werte darstellen und Auswahllisten erzeugen
// =====================================================================

function wertText(art, roh, beschreibung) {
  const zahl = parseInt(roh, 10);
  if (art === "liste") {
    const w = (beschreibung && beschreibung.werte) || [];
    return w[zahl] !== undefined ? w[zahl] : String(roh);
  }
  if (art === "tempo") return String((zahl / 10).toFixed(1)).replace(".", ",") + " BPM";
  if (art === "looplaenge") return zahl === 0 ? "AUTO" : zahl + (zahl === 1 ? " Takt" : " Takte");
  return String(roh);
}

function auswahlBauen(art, beschreibung) {
  const liste = [];
  const b = beschreibung || {};
  if (art === "liste") {
    (b.werte || []).forEach((t, i) => liste.push({ wert: i, text: t }));
  } else if (art === "tempo") {
    for (let bpm = 40; bpm <= 250; bpm++) liste.push({ wert: bpm * 10, text: bpm + " BPM" });
  } else if (art === "looplaenge") {
    liste.push({ wert: 0, text: "AUTO" });
    for (let t = 1; t <= 32; t++) liste.push({ wert: t, text: t + (t === 1 ? " Takt" : " Takte") });
  } else {
    const min = b.min !== undefined ? b.min : 0;
    const max = b.max !== undefined ? b.max : 100;
    for (let z = min; z <= max; z++) liste.push({ wert: z, text: String(z) });
  }
  return liste;
}

// Stellt sicher, dass der gerade gültige Wert in der Liste steht, auch wenn er
// außerhalb des bekannten Bereichs liegt. Sonst ließe er sich nicht wiederherstellen.
function auswahlMitJetzt(art, beschreibung, jetzt) {
  const liste = auswahlBauen(art, beschreibung);
  const zahl = parseInt(jetzt, 10);
  if (!isNaN(zahl) && !liste.some(o => String(o.wert) === String(zahl))) {
    liste.push({ wert: zahl, text: String(zahl) });
    liste.sort((a, b2) => a.wert - b2.wert);
  }
  return liste;
}

// =====================================================================
// Menü aufbauen
// =====================================================================

function neuerEintrag(eintrag) {
  const li = document.createElement("li");
  li.className = "eintrag";
  li.dataset.typ = eintrag.typ;
  if (eintrag.id) li.dataset.id = eintrag.id;
  li.tabIndex = -1;

  const zeile = document.createElement("span");
  zeile.className = "zeile";
  li.appendChild(zeile);

  for (const schluessel of ["datei", "nummer", "abschnitt", "feld", "rohwert", "art",
                            "spur", "laden", "ziel", "quelle", "quellspur", "zielspur"]) {
    if (eintrag[schluessel] !== undefined) li.dataset[schluessel] = eintrag[schluessel];
  }
  if (eintrag.beschreibung) li._beschreibung = eintrag.beschreibung;
  if (eintrag.vorschau) li._vorschau = eintrag.vorschau;

  const hatUnterebene = eintrag.typ === "ordner" || (eintrag.typ === "wert" && eintrag.laden);
  if (hatUnterebene) {
    const gruppe = document.createElement("ul");
    gruppe.setAttribute("role", "presentation");
    gruppe.hidden = true;
    li.appendChild(gruppe);
    li.dataset.unterebene = "ja";
    if (eintrag.kinder) baueEbene(eintrag.kinder, gruppe);
  }

  li.dataset.text = eintrag.text;
  aktualisiereZeile(li);
  return li;
}

function baueEbene(eintraege, elternListe) {
  for (const eintrag of eintraege) elternListe.appendChild(neuerEintrag(eintrag));
}

function setzeKinder(li, eintraege) {
  const gruppe = li.querySelector(":scope > ul");
  gruppe.innerHTML = "";
  baueEbene(eintraege, gruppe);
  li.dataset.geladen = "ja";
}

// Ein Ladeknopf bleibt an erster Stelle stehen und behält den Fokus.
function zeigeErgebnisse(ordner, ladeEintrag, ergebnisse) {
  setzeKinder(ordner, [ladeEintrag].concat(ergebnisse));
  oeffne(ordner);
  fokussiere(ordner.querySelector(":scope > ul > li"));
}

function aktualisiereZeile(li) {
  const zeile = li.querySelector(":scope > .zeile");
  let text = li.dataset.text;
  if (li.dataset.typ === "wert") {
    text = li.dataset.text + ": " + wertText(li.dataset.art, li.dataset.rohwert, li._beschreibung);
  }
  zeile.textContent = text;
  li.dataset.ansage = text;
}

// =====================================================================
// Navigation
// =====================================================================

// Nur die sichtbaren Geschwister der aktuellen Ebene. Zeilen, die der
// Menüfilter ausgeblendet hat, werden übersprungen.
function ebenenEintraege(li) {
  return Array.from(li.parentElement.children)
    .filter(e => e.classList.contains("eintrag") && e.style.display !== "none");
}

function fokussiere(li, stumm) {
  if (!li) return;
  baumElement.querySelectorAll(".eintrag").forEach(e => e.tabIndex = -1);
  li.tabIndex = 0;
  li.focus();
  // Die Zeilen tragen bewusst keine Rolle und keinen Namen. Dadurch sagt die
  // Sprachausgabe von sich aus nichts, und wir bestimmen den Wortlaut genau.
  if (!stumm) sage(li.dataset.ansage || li.dataset.text || "");
}

function hatUnterebene(li) {
  return li.dataset.unterebene === "ja";
}

function istOffen(li) {
  const g = li.querySelector(":scope > ul");
  return g && !g.hidden;
}

function oeffne(li) {
  const gruppe = li.querySelector(":scope > ul");
  if (!gruppe) return false;
  gruppe.hidden = false;
  return true;
}

function schliesse(li) {
  const gruppe = li.querySelector(":scope > ul");
  if (!gruppe) return false;
  gruppe.hidden = true;
  return true;
}

function elternVon(li) {
  const elternListe = li.parentElement;
  if (elternListe && elternListe !== baumElement) return elternListe.parentElement;
  return null;
}

function istHauptebene(li) {
  return li.parentElement === baumElement;
}

function ebeneZurueck(aktiv) {
  filterAufheben(true);
  if (istOffen(aktiv)) {
    schliesse(aktiv);
    klang("ebeneZurueck");
    return;
  }
  const eltern = elternVon(aktiv);
  if (eltern) {
    schliesse(eltern);
    fokussiere(eltern);
    klang(istHauptebene(eltern) ? "hauptmenue" : "ebeneZurueck");
  } else {
    spieleAnschlag();
  }
}

async function hineingehen(li) {
  if (!hatUnterebene(li)) { spieleAnschlag(); return; }
  filterAufheben(true);
  if (li.dataset.laden && li.dataset.geladen !== "ja") {
    const fertig = await laden(li);
    if (!fertig) return;
    if (fertig === "fokussiert") { klang("ebeneVor"); return; }
  }
  oeffne(li);
  const erstes = li.querySelector(":scope > ul > li");
  if (erstes) { fokussiere(erstes); klang("ebeneVor"); }
  else spieleAnschlag();
}

// =====================================================================
// Menüfilter
//
// Ein Buchstabe springt zum nächsten Eintrag mit diesem Anfangsbuchstaben.
// Zwei Buchstaben in weniger als einer halben Sekunde schalten das Sammeln
// ein: die Buchstaben werden gesammelt, und erst Pfeil runter zeigt das
// Ergebnis. Escape hebt den Filter wieder auf.
// =====================================================================

let filterText = "";
let filterSammelt = false;
let filterZeit = 0;
let filterEbene = null;

function filterAufheben(still) {
  if (filterEbene) {
    for (const e of filterEbene.children) {
      if (e.classList.contains("eintrag")) e.style.display = "";
    }
    filterEbene = null;
    if (!still) sage("Filter aufgehoben");
  }
  filterText = "";
  filterSammelt = false;
}

function springeZuBuchstabe(aktiv, buchstabe) {
  const ebene = ebenenEintraege(aktiv);
  const jetzt = ebene.indexOf(aktiv);
  for (let i = 1; i <= ebene.length; i++) {
    const kandidat = ebene[(jetzt + i) % ebene.length];
    if ((kandidat.dataset.text || "").trim().toLowerCase().startsWith(buchstabe)) {
      fokussiere(kandidat);
      return;
    }
  }
  spieleAnschlag();
}

function filterAnwenden(aktiv) {
  const liste = aktiv.parentElement;
  const suche = filterText.trim().toLowerCase();
  let treffer = 0;
  for (const e of liste.children) {
    if (!e.classList.contains("eintrag")) continue;
    const passt = (e.dataset.text || "").toLowerCase().includes(suche);
    e.style.display = passt ? "" : "none";
    if (passt) treffer++;
  }
  filterSammelt = false;
  if (!treffer) {
    for (const e of liste.children) {
      if (e.classList.contains("eintrag")) e.style.display = "";
    }
    filterEbene = null;
    filterText = "";
    sage("Kein Treffer");
    spieleAnschlag();
    return;
  }
  filterEbene = liste;
  const erste = Array.from(liste.children)
    .find(e => e.classList.contains("eintrag") && e.style.display !== "none");
  fokussiere(erste);
  sage(treffer + " Treffer für " + suche);
}

function filterTaste(ereignis, aktiv) {
  const zeichen = ereignis.key;
  if (zeichen.length !== 1 || ereignis.ctrlKey || ereignis.altKey || ereignis.metaKey) return;
  ereignis.preventDefault();
  const jetzt = Date.now();
  if (jetzt - filterZeit < 500 && filterText.length >= 1) {
    filterText += zeichen.toLowerCase();
    filterSammelt = true;
    sage("Filter " + filterText);
  } else {
    filterText = zeichen.toLowerCase();
    filterSammelt = false;
    springeZuBuchstabe(aktiv, filterText);
  }
  filterZeit = jetzt;
}

// =====================================================================
// Tooltip: Shift halten und Pfeil runter
// =====================================================================

const tooltip = document.getElementById("tooltip");
let tooltipOffen = false;
let tooltipRueckkehr = null;

function tooltipZeilen(li) {
  if (li.dataset.typ === "wert") {
    const b = li._beschreibung || {};
    const jetzt = wertText(li.dataset.art, li.dataset.rohwert, b);
    // Bewusst nur der eingestellte Zustand. Die wählbaren Werte stehen im
    // Untermenü und würden den Tooltip nur aufblähen.
    const zeilen = ["Eingestellt " + jetzt];
    if (b.nurLesen) zeilen.push("Lässt sich hier nicht ändern");
    return zeilen;
  }
  if (li._ergebnis) return li._ergebnis;
  // Ordner mit Vorschau: das Profil sagt Zeile für Zeile, was drin steht.
  if (li.dataset.typ === "ordner" && li._vorschau) return li._vorschau;
  // Aktionen, die noch nicht gelaufen sind, sagen was danach eingestellt ist,
  // sofern sie eine Vorschau mitbringen. Sonst nur der Hinweis zum Ausführen.
  if (li.dataset.typ === "aktion") return li._vorschau || ["Bitte ausführen"];
  return null;
}

function oeffneTooltip(li) {
  const zeilen = tooltipZeilen(li);
  if (!zeilen || !zeilen.length) { sage("Keine weiteren Angaben"); return; }

  tooltip.innerHTML = "";
  for (const z of zeilen) {
    const zeile = document.createElement("li");
    zeile.textContent = z;
    zeile.dataset.ansage = z;
    zeile.tabIndex = -1;
    tooltip.appendChild(zeile);
  }
  tooltip.hidden = false;
  tooltipOffen = true;
  tooltipRueckkehr = li;
  klang("tooltipAuf");
  tooltip.children[0].focus();
  sage(zeilen[0]);
}

function tooltipWeiter(richtung) {
  const zeilen = Array.from(tooltip.children);
  const jetzt = zeilen.indexOf(document.activeElement);
  const ziel = jetzt + richtung;
  if (ziel < 0 || ziel >= zeilen.length) { spieleAnschlag(); return; }
  zeilen[ziel].focus();
  sage(zeilen[ziel].dataset.ansage || zeilen[ziel].textContent);
}

function schliesseTooltip() {
  if (!tooltipOffen) return;
  tooltip.hidden = true;
  tooltipOffen = false;
  klang("tooltipZu");
  if (tooltipRueckkehr) fokussiere(tooltipRueckkehr, true);
  tooltipRueckkehr = null;
}

document.addEventListener("keydown", (e) => {
  if (!e.shiftKey) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if (!eingabefeld.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  if (!tooltipOffen) {
    const li = document.activeElement;
    if (!li || !li.classList || !li.classList.contains("eintrag")) return;
    oeffneTooltip(li);
    return;
  }
  tooltipWeiter(e.key === "ArrowDown" ? 1 : -1);
}, true);

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" && tooltipOffen) schliesseTooltip();
}, true);

// =====================================================================
// Quelle der Daten
// =====================================================================

async function quelleSichern() {
  if (stationsPfad) return stationsPfad;
  const gefunden = await window.skuConnect.stationSuchen();
  if (gefunden.gefunden) { stationsPfad = gefunden.rolandPfad; schreibbar = true; return stationsPfad; }
  const eigen = await window.skuConnect.datenordner();
  if (eigen.ok && eigen.vorhanden) { stationsPfad = eigen.pfad; schreibbar = false; return stationsPfad; }
  return null;
}

// =====================================================================
// Inhalte nachladen
// =====================================================================

async function laden(li) {
  const art = li.dataset.laden;

  // Die Listen des Live-Bereichs brauchen keine Stationsdaten.
  if (art === "midiplatz" || art === "midicc" || art === "midikanal") {
    setzeKinder(li, liveLaden(art, li));
    return true;
  }

  const pfad = await quelleSichern();
  if (!pfad) { sage("Keine Daten, erst Station suchen"); return false; }

  // Alle Menues, die sich auf einen Speicherplatz beziehen, holen ihre
  // Nummer aus der Auswahl. So zeigen sie immer den gewählten Platz.
  if (["trackmenu", "memorymenu", "zielplatz", "loops"].includes(art)) {
    if (!gewaehlterPlatz) { sage("Erst einen Speicherplatz wählen"); return false; }
    li.dataset.nummer = String(gewaehlterPlatz);
  }

  // Initialize fragt bewusst nach. Der Vorgang loescht Aufnahmen und laesst
  // sich am Geraet nicht rueckgaengig machen.
  // Die Anleitung steht als ein Schritt je Zeile da, damit man sich mit
  // Pfeil runter durchhangeln kann und je Zeile genau eine Anweisung hört.
  if (art === "schritte-buehne" || art === "schritte-werkstatt") {
    const ziel = art === "schritte-buehne" ? "buehne" : "werkstatt";
    setzeKinder(li, schritteFuer(ziel).map(s => ({ typ: "aktion", id: "schritt", text: s })));
    return true;
  }

  // Track-Profile. Ein Profil hält nur die Abweichungen vom Werkszustand.
  if (art === "profile") {
    const e = await window.skuConnect.profileLesen();
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const kinder = e.profile.map(p => ({
      typ: "ordner", laden: "profil", ziel: p.name,
      text: p.name + ", " + p.werte.length + (p.werte.length === 1 ? " Abweichung" : " Abweichungen"),
      vorschau: profilZeilen(p)
    }));
    kinder.push({ typ: "aktion", id: "profil-neu", text: "Neues Profil erstellen" });
    setzeKinder(li, kinder);
    return true;
  }

  if (art === "profil") {
    const name = li.dataset.ziel;
    const platz = gewaehlterPlatz ? String(gewaehlterPlatz).padStart(2, "0") : null;
    setzeKinder(li, [
      { typ: "aktion", id: "profil-platz", ziel: name,
        text: platz ? "Auf Platz " + platz + " schreiben" : "Auf den gewählten Platz schreiben, noch keiner gewählt" },
      { typ: "ordner", laden: "profil-leer-frage", ziel: name,
        text: "Auf alle leeren Speicherplätze schreiben" },
      { typ: "aktion", id: "profil-ueberschreiben", ziel: name,
        text: platz ? "Überschreiben mit dem Stand von Platz " + platz : "Überschreiben mit dem gewählten Platz" },
      { typ: "aktion", id: "profil-umbenennen", ziel: name, text: "Umbenennen" },
      { typ: "ordner", laden: "profil-loesch-frage", ziel: name, text: "Löschen" },
      { typ: "ordner", laden: "initfrage", text: "Gewählten Platz auf Werkszustand zurücksetzen" }
    ]);
    return true;
  }

  // Das Schreiben auf alle leeren Plätze fasst viele Plätze an, darum erst
  // zählen und fragen. Gezählt wird jetzt, nicht aus einer alten Liste.
  if (art === "profil-leer-frage") {
    const name = li.dataset.ziel;
    const pfad = await quelleSichern();
    if (!pfad || !schreibbar) { sage("Nur mit angeschlossener Station möglich"); return false; }
    const e = await window.skuConnect.leerePlaetze(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    if (!e.nummern.length) { sage("Es gibt gerade keinen leeren Speicherplatz"); return false; }
    const liste = e.nummern.join(", ");
    setzeKinder(li, [
      { typ: "aktion", id: "profil-abbrechen", text: "Abbrechen, nichts ändern" },
      { typ: "aktion", id: "profil-alle", ziel: name,
        text: "Ja, " + name + " auf " + e.nummern.length + " leere Plätze schreiben",
        vorschau: ["Danach tragen diese Plätze das Profil " + name,
                   "Plätze: " + liste,
                   "Die Namen der Plätze bleiben, wie sie sind",
                   "Aufnahmen sind dort keine, darum geht nichts verloren"] }
    ]);
    return true;
  }

  if (art === "profil-loesch-frage") {
    const name = li.dataset.ziel;
    setzeKinder(li, [
      { typ: "aktion", id: "profil-abbrechen", text: "Abbrechen, nichts ändern" },
      { typ: "aktion", id: "profil-weg", ziel: name, text: "Ja, Profil " + name + " löschen" }
    ]);
    return true;
  }

  if (art === "initfrage") {
    if (!gewaehlterPlatz) { sage("Erst einen Speicherplatz wählen"); return false; }
    setzeKinder(li, [
      { typ: "aktion", id: "init-abbrechen", text: "Abbrechen, nichts ändern" },
      { typ: "aktion", id: "init-ausfuehren", nummer: gewaehlterPlatz,
        text: "Ja, Platz " + String(gewaehlterPlatz).padStart(2, "0") + " löschen und zurücksetzen" }
    ]);
    return true;
  }

  // Copy Track in drei Schritten: Quellplatz, Quellspur, Zielspur.
  if (art === "ct-quelle") {
    if (!gewaehlterPlatz) { sage("Erst einen Speicherplatz wählen"); return false; }
    const e = await window.skuConnect.speicherplaetzeLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, e.plaetze.filter(pl => pl.spuren > 0).map(pl => ({
      typ: "ordner", laden: "ct-spur", quelle: pl.nummer,
      text: String(pl.nummer).padStart(2, "0") + " " + pl.name.trim() + ", " + pl.spuren + " Spuren"
    })));
    return true;
  }

  if (art === "ct-spur") {
    const quelle = parseInt(li.dataset.quelle, 10);
    const e = await window.skuConnect.loopsAuflisten(pfad, quelle);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, e.spuren.map(s => ({
      typ: "ordner", laden: "ct-ziel", quelle, quellspur: s.spur,
      text: "Spur " + s.spur + ", " + (s.datei ? s.sekunden.toFixed(1).replace(".", ",") + " Sekunden" : "leer")
    })));
    return true;
  }

  if (art === "ct-ziel") {
    const quelle = parseInt(li.dataset.quelle, 10);
    const quellspur = parseInt(li.dataset.quellspur, 10);
    const ziele = [];
    for (let s = 1; s <= 5; s++) {
      ziele.push({ typ: "aktion", id: "ct-ausfuehren", quelle, quellspur, zielspur: s,
        text: "Auf Spur " + s + " von Platz " + String(gewaehlterPlatz).padStart(2, "0") });
    }
    setzeKinder(li, ziele);
    return true;
  }

  if (art === "trackmenu" || art === "memorymenu") {
    const e = await window.skuConnect.speicherplatzLesen(pfad, gewaehlterPlatz);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, art === "trackmenu" ? trackEintraege(e.daten) : memoryEintraege(e.daten));
    return true;
  }

  if (art === "wertoptionen") {
    const liste = auswahlMitJetzt(li.dataset.art, li._beschreibung, li.dataset.rohwert);
    const jetzt = String(li.dataset.rohwert);
    setzeKinder(li, liste.map(o => ({ typ: "option", text: o.text, ziel: o.wert })));
    const gruppe = li.querySelector(":scope > ul");
    const treffer = Array.from(gruppe.children).find(k => k.dataset.ziel === jetzt);
    if (treffer) { oeffne(li); fokussiere(treffer); return "fokussiert"; }
    return true;
  }

  if (art === "loops") {
    const e = await window.skuConnect.loopsAuflisten(pfad, parseInt(li.dataset.nummer, 10));
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    setzeKinder(li, e.spuren.map(s => ({
      typ: "ordner",
      text: "Spur " + s.spur + ": " + (s.datei ? s.sekunden.toFixed(1).replace(".", ",") + " Sekunden" : "leer"),
      nummer: li.dataset.nummer, spur: s.spur,
      kinder: [
        { typ: "aktion", id: "loop-export", text: "Aufnahme exportieren", nummer: li.dataset.nummer, spur: s.spur },
        { typ: "aktion", id: "loop-import", text: "WAV-Datei einspielen", nummer: li.dataset.nummer, spur: s.spur }
      ]
    })));
    return true;
  }

  // Spiegel des Gerätemenüs: alle Systemwerte in genau der Reihenfolge, in
  // der sie auch an der Station stehen. Damit lässt sich am Bildschirm
  // abzählen, wie oft man am Gerät den Pfeil rechts drücken muss.
  //
  // Dass die Reihenfolge stimmt, ist belegt: In der Datei liegt Eingang auf
  // Line Out zwei Plätze vor der USB-Betriebsart, und genau dieser Abstand
  // hat sich am Gerät bestätigt.
  if (art === "systemmenu") {
    const e = await window.skuConnect.systemLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const eintraege = [];
    let nummer = 0;
    for (const abschnitt of Object.keys(e.daten)) {
      for (const feld of Object.keys(e.daten[abschnitt])) {
        // Der zuletzt gewählte Speicherplatz steht zwar in der Datei, ist aber
        // kein Menüpunkt der Station. Er wird im Spielbildschirm mit dem
        // Regler gewählt. Darum bleibt er hier draußen, sonst würde er die
        // ganze Nummerierung um eins verschieben.
        if (abschnitt === "SETUP" && feld === "MemNum") continue;
        nummer++;
        const b = feldBeschreibung(abschnitt, feld);
        const nr = String(nummer).padStart(2, "0");
        // Der Anker wird eigens benannt, er ist der einzige Wert, den man
        // am Gerät hören kann.
        const anker = (abschnitt === "INPUT_OUTPUT" && feld === "InLineOut")
          ? ", Anker, Mikrofon im Lautsprecher" : "";
        if (b) {
          eintraege.push({
            typ: "wert", text: nr + " " + b.text + anker, art: b.art || "zahl",
            datei: "SYSTEM", nummer: 0, abschnitt, feld, rohwert: e.daten[abschnitt][feld],
            beschreibung: b, laden: b.nurLesen ? undefined : "wertoptionen",
            id: b.nurLesen ? "nur-lesen" : "wert"
          });
        } else {
          eintraege.push({ typ: "aktion", id: "nur-lesen",
            text: nr + " " + feld + ": " + e.daten[abschnitt][feld] });
        }
      }
    }
    setzeKinder(li, eintraege);
    return true;
  }

  if (art === "system") {
    const e = await window.skuConnect.systemLesen(pfad);
    if (!e.ok) { sage("Fehler: " + e.fehler); return false; }
    const eintraege = [];
    for (const abschnitt of Object.keys(e.daten)) {
      eintraege.push({ typ: "ordner", text: abschnittName(abschnitt),
        kinder: felderZuEintraegen("SYSTEM", 0, abschnitt, e.daten[abschnitt]) });
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
  if (/^(INPUT_FX|TRACK_FX)[123]$/.test(abschnitt)) return "Parameter Taste " + "ABC"[abschnitt.slice(-1) - 1];
  if (/^BEAT_FX[123]$/.test(abschnitt)) return "Beat-Effekte Taste " + "ABC"[abschnitt.slice(-1) - 1];
  return abschnitt;
}

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
      eintraege.push({ typ: "aktion", id: "nur-lesen", text: feld + ": " + werte[feld] });
    }
  }
  return eintraege;
}

// Ein einzelnes Feld als Menuezeile. Damit lassen sich Menues in einer
// selbst bestimmten Reihenfolge bauen, auch quer ueber die Abschnitte der
// Datei hinweg. Das ist noetig, weil die Station ihre Menues anders ordnet
// als die Datei ihre Abschnitte.
function feldEintrag(nummer, abschnitt, feld, wert) {
  const b = feldBeschreibung(abschnitt, feld);
  if (!b) return { typ: "aktion", id: "nur-lesen", text: feld + ": " + wert };
  return {
    typ: "wert", text: b.text, art: b.art || "zahl",
    datei: "MEMORY", nummer, abschnitt, feld, rohwert: wert,
    beschreibung: b, laden: b.nurLesen ? undefined : "wertoptionen",
    id: b.nurLesen ? "nur-lesen" : "wert"
  };
}

// Die Reihenfolge des Memory-Menues der Station, Handbuch Seite 15 und 16.
// Die Eintraege aus Firmware 2.0 sind eingeordnet, ihre genaue Position ist
// dort nicht beschrieben.
const MEMORY_MENUE = [
  ["MASTER", "Lvl"], ["MASTER", "Tmp"], ["MASTER", "Cs"], ["MASTER", "Rv"],
  ["INPUT_FX", "Mod"], ["TRACK_FX", "Mod"],
  ["MASTER", "PhOut"], ["MASTER", "PhOutTr"],
  ["REC_OPTION", "DubMod"], ["REC_OPTION", "RecAct"], ["REC_OPTION", "RecQtz"],
  ["PLAY_OPTION", "SinglePlyChg"], ["PLAY_OPTION", "LpQtz"], ["PLAY_OPTION", "LpLen"],
  ["PLAY_OPTION", "AllStrt"], ["PLAY_OPTION", "AllStp"], ["PLAY_OPTION", "FadeTim"],
  ["PLAY_OPTION", "TgtTr"]
];

// Die Reihenfolge des Rhythmus-Menues, Handbuch Seite 19.
// Sw ist der Ein-Aus-Zustand der Rhythmus-Taste, kein Menuepunkt.
const RHYTHMUS_MENUE = ["Lvl", "Ptn", "Bt", "LineOut", "RecCnt", "PlyCnt", "Stp"];

// Die Reihenfolge eines Spur-Menues, Handbuch Seite 12 bis 14.
// RecTmp, WavStat und WavLen sind Angaben zur Aufnahme, keine Menuepunkte.
const SPUR_MENUE = ["Rev", "PlyLvl", "Pan", "One", "TrkFx", "PlyMod",
                    "StrtMod", "StpMod", "MeasMod", "MeasLen", "MeasBtLp",
                    "LpSync", "TmpSync"];

function memoryEintraege(daten) {
  const n = daten.nummer;
  // Input Fx Mode und Track Fx Mode teilen sich im Dateiformat eine
  // Beschreibung. Im Menü brauchen sie eigene Namen, sonst stehen dort
  // zwei gleich lautende Zeilen.
  const eigeneNamen = { "INPUT_FX.Mod": "Input Fx Mode, Rohwert",
                        "TRACK_FX.Mod": "Track Fx Mode, Rohwert" };
  const eintraege = MEMORY_MENUE
    .filter(([a, f]) => daten[a] && daten[a][f] !== undefined)
    .map(([a, f]) => {
      const e = feldEintrag(n, a, f, daten[a][f]);
      const name = eigeneNamen[a + "." + f];
      if (name) e.text = name;
      return e;
    });

  eintraege.push({ typ: "aktion", id: "name-aendern", text: "Name: " + daten.name.trim(), nummer: n });

  const zuweisungen = [];
  for (let i = 1; i <= 16; i++) {
    zuweisungen.push({ typ: "ordner", text: abschnittName("ASSIGN" + i),
      kinder: felderZuEintraegen("MEMORY", n, "ASSIGN" + i, daten["ASSIGN" + i]) });
  }
  eintraege.push({ typ: "ordner", text: "Zuweisungen, 16 Stück", kinder: zuweisungen });

  return eintraege;
}

function trackEintraege(daten) {
  const n = daten.nummer;
  const eintraege = [{ typ: "ordner", text: "Rhythmus menü",
    kinder: RHYTHMUS_MENUE
      .filter(f => daten.RHYTHM && daten.RHYTHM[f] !== undefined)
      .map(f => feldEintrag(n, "RHYTHM", f, daten.RHYTHM[f])) }];
  for (let s = 1; s <= 5; s++) {
    const ab = "TRACK" + s;
    eintraege.push({ typ: "ordner", text: "Spur " + s + " Edit",
      kinder: SPUR_MENUE
        .filter(f => daten[ab] && daten[ab][f] !== undefined)
        .map(f => feldEintrag(n, ab, f, daten[ab][f])) });
  }

  // Input FX und Track FX gehoeren zum Speicherplatz, nicht zu einer
  // einzelnen Spur. Sie stehen deshalb hier, im Anschluss an die Spuren.
  for (const bank of ["INPUT_FX", "TRACK_FX"]) {
    const kinder = felderZuEintraegen("MEMORY", n, bank, daten[bank]);
    for (let i = 1; i <= 3; i++) {
      const teil = bank + i;
      kinder.push({ typ: "ordner", text: abschnittName(teil),
        kinder: felderZuEintraegen("MEMORY", n, teil, daten[teil]) });
    }
    if (bank === "TRACK_FX") {
      for (let i = 1; i <= 3; i++) {
        const teil = "BEAT_FX" + i;
        if (daten[teil] && Object.keys(daten[teil]).length) {
          kinder.push({ typ: "ordner", text: abschnittName(teil),
            kinder: felderZuEintraegen("MEMORY", n, teil, daten[teil]) });
        }
      }
    }
    eintraege.push({ typ: "ordner", text: abschnittName(bank), kinder });
  }
  return eintraege;
}

// =====================================================================
// Aktionen der Werkstatt
// =====================================================================

async function stationSuchen(li) {
  const e = await window.skuConnect.stationSuchen();
  if (e.gefunden) {
    stationsPfad = e.rolandPfad; schreibbar = true;
    gewaehlterPlatz = null;
    // Die Rücklage im Programm wird beim Verbinden auf den Stand der
    // Station gebracht. Ein eigener Menüpunkt dafür ist dadurch unnötig.
    const r = await window.skuConnect.einstellungenEinlesen(e.rolandPfad);
    ergebnis(li, "Station gefunden, Laufwerk " + e.laufwerk, [
      "Station gefunden", "Laufwerk " + e.laufwerk, "Ändern möglich",
      r.ok ? "Rücklage im Programm aufgefrischt" : "Rücklage nicht aufgefrischt",
      "Jetzt einen Speicherplatz wählen"]);
    return;
  }
  const eigen = await window.skuConnect.datenordner();
  if (eigen.ok && eigen.vorhanden) {
    stationsPfad = eigen.pfad; schreibbar = false;
    ergebnis(li, "Keine Station, nur Lesen",
      ["Keine Station angeschlossen", "Arbeite mit dem eingelesenen Stand", "Ändern nicht möglich"]);
    return;
  }
  stationsPfad = null; schreibbar = false;
  ergebnis(li, "Keine Station gefunden", [
    "Keine Station gefunden", "Sie muss im Speicher-Modus angeschlossen sein",
    "Am Gerät: SYSTEM ein Mal, dann Pfeil rechts dreizehn Mal",
    "Probe nach elf Mal: Regler eine Raste links, das Mikrofon muss verstummen",
    "Dann Regler zurück, zwei Mal Pfeil rechts, Regler auf STORAGE, EXIT",
    "Danach Station aus und wieder ein"
  ]);
}


// Enter auf einem Platz wählt ihn aus. Der Name des Ordners darüber nennt
// danach den gewählten Platz, damit beim nächsten Besuch sofort klar ist,
// womit gearbeitet wird.
// Initialize: setzt den gewählten Platz auf den Werkszustand zurück.
async function platzInitialisieren(li) {
  const pfad = await quelleSichern();
  if (!pfad || !schreibbar) { sage("Nur mit angeschlossener Station möglich"); return; }
  const nummer = parseInt(li.dataset.nummer, 10);
  sage("Setze Platz " + nummer + " zurück");
  const e = await window.skuConnect.platzInitialisieren(pfad, nummer);
  if (!e.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", e.fehler]); return; }
  ergebnis(li, e.bestaetigt ? "Platz " + nummer + " zurückgesetzt" : "Achtung, nicht bestätigt", [
    "Platz " + nummer + " steht wieder auf Werkszustand",
    "Die Aufnahmen dieses Platzes sind gelöscht",
    "Der Stand davor liegt in Git"]);
}

// Copy Track: holt eine Spur aus einem anderen Platz, samt Aufnahme.
async function spurKopieren(li) {
  const pfad = await quelleSichern();
  if (!pfad || !schreibbar) { sage("Nur mit angeschlossener Station möglich"); return; }
  const quelle = parseInt(li.dataset.quelle, 10);
  const quellspur = parseInt(li.dataset.quellspur, 10);
  const zielspur = parseInt(li.dataset.zielspur, 10);
  sage("Kopiere Spur");
  const e = await window.skuConnect.spurKopieren(pfad, quelle, quellspur, gewaehlterPlatz, zielspur);
  if (!e.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", e.fehler]); return; }
  ergebnis(li, e.bestaetigt ? "Spur kopiert" : "Achtung, nicht bestätigt", [
    "Von Platz " + quelle + ", Spur " + quellspur,
    "Auf Platz " + gewaehlterPlatz + ", Spur " + zielspur,
    e.dateien ? e.dateien + " Aufnahme übernommen" : "Die Quellspur war leer",
    "Der Stand davor liegt in Git"]);
}

// Macht aus den Abweichungen lesbare Zeilen für den Tooltip.
function profilZeilen(profil) {
  const zeilen = ["Angelegt am " + profil.angelegt + " von Platz " + profil.quelle,
                  profil.werte.length + " Abweichungen vom Werkszustand"];
  for (const w of profil.werte) {
    const b = feldBeschreibung(w.abschnitt, w.feld) || { text: w.abschnitt + " " + w.feld, art: "zahl" };
    const kopf = /^TRACK[1-5]$/.test(w.abschnitt) ? "Spur " + w.abschnitt.slice(5) + ", " : "";
    zeilen.push(kopf + b.text + ": " + wertText(b.art, w.wert, b)
      + ", Werk " + wertText(b.art, w.werk, b));
  }
  return zeilen;
}

// Legt ein Profil an oder überschreibt eines mit dem Stand des gewählten
// Platzes. Gespeichert wird nur, was vom Werkszustand abweicht.
async function profilNeu(li, vorhandenerName) {
  const pfad = await quelleSichern();
  if (!pfad) { sage("Nur mit angeschlossener Station möglich"); return; }
  if (!gewaehlterPlatz) { sage("Erst einen Speicherplatz wählen"); return; }
  let name = vorhandenerName;
  if (!name) {
    name = await frageText("Name des Profils, höchstens 12 Zeichen", "");
    fokussiere(li);
    if (name === null) { sage("Abgebrochen"); return; }
  }
  const e = await window.skuConnect.profilAnlegen(pfad, gewaehlterPlatz, name);
  if (!e.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", e.fehler]); return; }
  const p = e.profil;
  ergebnis(li, (vorhandenerName ? "Überschrieben: " : "Angelegt: ") + p.name,
    ["Profil " + p.name + (vorhandenerName ? " überschrieben" : " angelegt"),
     "Gelesen von Platz " + gewaehlterPlatz,
     p.werte.length + " Abweichungen vom Werkszustand festgehalten",
     "Der Name des Platzes gehört nicht dazu"]);
}

// Schreibt ein Profil auf den gewählten Platz oder auf alle leeren.
async function profilSchreiben(li, wohin) {
  const name = li.dataset.ziel;
  const pfad = await quelleSichern();
  if (!pfad || !schreibbar) { sage("Nur mit angeschlossener Station möglich"); return; }
  let nummern;
  if (wohin === "alle") {
    const l = await window.skuConnect.leerePlaetze(pfad);
    if (!l.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", l.fehler]); return; }
    nummern = l.nummern;
    sage("Schreibe auf " + nummern.length + " Plätze, das dauert einen Moment");
  } else {
    if (!gewaehlterPlatz) { sage("Erst einen Speicherplatz wählen"); return; }
    nummern = [gewaehlterPlatz];
  }
  const e = await window.skuConnect.profilAnwenden(pfad, name, nummern);
  if (!e.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", e.fehler]); return; }
  if (e.leer) {
    ergebnis(li, "Profil ist leer", ["Das Profil " + name + " hält keine Abweichung fest",
      "Der gewählte Platz stand auf Werkszustand, als es angelegt wurde"]);
    return;
  }
  ergebnis(li, e.bestaetigt ? "Geschrieben, " + e.plaetze + " Plätze" : "Achtung, Kontrolle fehlgeschlagen",
    e.bestaetigt
      ? ["Profil " + name + " geschrieben",
         "Plätze: " + nummern.join(", "),
         e.felder + " Werte gesetzt",
         "Die Namen der Plätze sind unberührt",
         "Der Stand davor liegt in Git"]
      : [e.abweichungen + " Felder stimmen nach dem Schreiben nicht",
         "Den Stand am Gerät prüfen",
         "Der Stand davor liegt in Git"]);
}

async function profilUmbenennen(li) {
  const alt = li.dataset.ziel;
  const neu = await frageText("Neuer Name, höchstens 12 Zeichen", alt);
  fokussiere(li);
  if (neu === null) { sage("Abgebrochen"); return; }
  const e = await window.skuConnect.profilUmbenennen(alt, neu);
  if (!e.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Heißt jetzt " + e.name, ["Umbenannt", "Vorher: " + alt, "Jetzt: " + e.name,
    "Die Liste der Profile frischt beim nächsten Öffnen auf"]);
}

async function profilWeg(li) {
  const name = li.dataset.ziel;
  const e = await window.skuConnect.profilLoeschen(name);
  if (!e.ok) { ergebnis(li, "Fehlgeschlagen", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Profil " + e.geloescht + " gelöscht",
    ["Gelöscht: " + e.geloescht,
     "Die Speicherplätze bleiben, wie sie sind",
     "Die Liste der Profile frischt beim nächsten Öffnen auf"]);
}

// Legt eine Sicherung im Ordner Ausgaben und Sicherungen an.
async function sicherungAnlegen(li, mitLoops) {
  const pfad = await quelleSichern();
  if (!pfad) { sage("Keine Daten, erst Station suchen"); return; }
  sage(mitLoops ? "Sichere Einstellungen und Loops, bitte warten" : "Sichere Einstellungen");
  const e = await window.skuConnect.sicherungAnlegen(pfad, mitLoops);
  if (!e.ok) { ergebnis(li, "Sicherung fehlgeschlagen", ["Fehler", e.fehler]); return; }
  const mb = (e.bytes / 1048576).toFixed(1).replace(".", ",");
  ergebnis(li, "Gesichert, " + e.dateien + " Dateien", [
    "Ordner " + e.ordner, e.dateien + " Dateien", mb + " MB",
    e.spuren + " Spuren mit Aufnahme", "Liegt in " + e.pfad]);
}

function platzWaehlen(li) {
  gewaehlterPlatz = parseInt(li.dataset.nummer, 10);
  const ordner = elternVon(li);
  if (ordner) {
    ordner.dataset.text = "Speicherplätze, Platz "
      + String(gewaehlterPlatz).padStart(2, "0") + " gewählt";
    aktualisiereZeile(ordner);
  }
  ergebnis(li, "Platz " + gewaehlterPlatz + " gewählt", ["Gewählt", li.dataset.text]);
}

async function speicherplaetzeLaden(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten, erst Station suchen"); return; }
  const e = await window.skuConnect.speicherplaetzeLesen(p);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }

  const ordner = elternVon(li);
  const eintraege = e.plaetze.map(pl => {
    const laenge = pl.lpLen === 0 ? "AUTO" : pl.lpLen + " Takte";
    const spuren = pl.spuren === 0 ? "leer" : pl.spuren + " Spuren";
    return {
      typ: "aktion", id: "platz-waehlen",
      text: String(pl.nummer).padStart(2, "0") + " " + pl.name.trim() + ", " + laenge + ", " + spuren,
      nummer: pl.nummer
    };
  });
  zeigeErgebnisse(ordner, { typ: "aktion", id: "platz-laden", text: "Speicherplätze laden" }, eintraege);
  const belegt = e.plaetze.filter(x => x.spuren > 0);
  const neuerKnopf = ordner.querySelector(":scope > ul > li");
  ergebnis(neuerKnopf, e.plaetze.length + " Plätze, " + belegt.length + " belegt",
    [e.plaetze.length + " Speicherplätze", belegt.length + " davon belegt"].concat(
      belegt.map(x => "Platz " + x.nummer + ", " + x.name.trim() + ", " + x.spuren + " Spuren")));
}

async function wertSetzen(optionLi) {
  const wertLi = elternVon(optionLi);
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }

  const neu = optionLi.dataset.ziel;
  const alterText = wertText(wertLi.dataset.art, wertLi.dataset.rohwert, wertLi._beschreibung);
  const e = await window.skuConnect.wertSchreiben(stationsPfad, auftrag);
  if (!e.ok) { ergebnis(wertLi, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }

  if (!e.geaendert) {
    ergebnis(wertLi, "Steht schon auf " + optionLi.dataset.text, null);
  } else if (e.bestaetigt) {
    wertLi.dataset.rohwert = neu;
    aktualisiereZeile(wertLi);
    ergebnis(wertLi, wertLi.dataset.text + " geändert auf " + optionLi.dataset.text, null);
  } else {
    ergebnis(wertLi, "Achtung, Kontrolle fehlgeschlagen", [
      "Die Kontrolle nach dem Schreiben hat nicht gestimmt",
      "Gewünscht: " + neu, "Gelesen: " + e.gelesen, "Vorher: " + alterText,
      "Den Wert am Gerät prüfen"
    ]);
    return;
  }
  schliesse(wertLi);
  wertLi.dataset.geladen = "";
  fokussiere(wertLi, true);
  klang("ebeneZurueck");
}

function frageText(beschriftung, vorgabe) {
  return new Promise((fertig) => {
    eingabefeld.value = vorgabe || "";
    eingabefeld.setAttribute("aria-label", beschriftung + ", Enter bestätigt, Escape bricht ab");
    eingabefeld.hidden = false;
    eingabefeld.focus();
    eingabefeld.select();
    sage(beschriftung);
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
  const e = await window.skuConnect.nameSchreiben(stationsPfad, parseInt(li.dataset.nummer, 10), neu);
  if (!e.ok) { ergebnis(li, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }
  li.dataset.text = "Name: " + e.name;
  aktualisiereZeile(li);
  ergebnis(li, "Name geändert auf " + e.name,
    ["Name geändert", "Jetzt: " + e.name, "Vorher: " + alt]);
}

async function platzUebertragen(optionLi, tauschen) {
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }
  const von = parseInt(optionLi.dataset.nummer, 10);
  const nach = parseInt(optionLi.dataset.ziel, 10);
  if (von === nach) { sage("Quelle und Ziel sind gleich"); return; }
  const e = tauschen
    ? await window.skuConnect.platzTauschen(stationsPfad, von, nach)
    : await window.skuConnect.platzKopieren(stationsPfad, von, nach);
  if (!e.ok) { ergebnis(optionLi, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.bestaetigt) {
    ergebnis(optionLi, (tauschen ? "Getauscht mit Platz " : "Kopiert auf Platz ") + nach, [
      (tauschen ? "Getauscht" : "Kopiert"), "Von Platz " + von, "Nach Platz " + nach,
      "Nur die Einstellungen", "Die Loop-Aufnahmen bleiben liegen"
    ]);
  } else {
    ergebnis(optionLi, "Achtung, Kontrolle fehlgeschlagen",
      ["Die Kontrolle nach dem Schreiben hat nicht gestimmt", "Den Platz am Gerät prüfen"]);
  }
}

async function loopExportieren(li) {
  const p = await quelleSichern();
  if (!p) { sage("Keine Daten vorhanden"); return; }
  const vorschlag = "Platz" + String(li.dataset.nummer).padStart(2, "0") + "_Spur" + li.dataset.spur + ".wav";
  const wahl = await window.skuConnect.dateiWaehlen(true, vorschlag);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }
  const e = await window.skuConnect.loopExportieren(p, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { ergebnis(li, "Fehler beim Export", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Exportiert, " + Math.round(e.bytes / 1024) + " Kilobyte",
    ["Export fertig", Math.round(e.bytes / 1024) + " Kilobyte", "Datei: " + wahl.pfad]);
}

async function loopImportieren(li) {
  if (!schreibbar) { sage("Nur Lesen, Station nicht verbunden"); return; }
  const wahl = await window.skuConnect.dateiWaehlen(false);
  if (!wahl.ok || wahl.abgebrochen) { sage("Abgebrochen"); return; }
  const e = await window.skuConnect.loopImportieren(stationsPfad, parseInt(li.dataset.nummer, 10), parseInt(li.dataset.spur, 10), wahl.pfad);
  if (!e.ok) { ergebnis(li, "Einspielen nicht möglich", ["Fehler", e.fehler]); return; }
  ergebnis(li, "Eingespielt auf Spur " + li.dataset.spur,
    ["Eingespielt", "Spur " + li.dataset.spur, "Datei: " + e.datei]);
}



// Trennen und Wiederverbinden der USB-Verbindung, ohne das Kabel anzufassen.
//
// Die Station bringt dafür einen eigenen Weg mit, der im Handbuch steht:
// Erst am Rechner die Schreibpuffer leeren, dann am Gerät EXIT drücken und
// die Rückfrage mit WRITE bestätigen. Erst danach verlässt die Station den
// Zustand Idling, das Bedienfeld reagiert wieder und die Betriebsart lässt
// sich umstellen. Solange sie als Laufwerk verbunden ist, sind die Tasten
// am Gerät wirkungslos.
// =====================================================================
// Betriebsart der Station
//
// Die Station kann immer nur eines von beidem: als Laufwerk erscheinen
// (Werkstatt) oder als Audio- und MIDI-Gerät (Bühne). Was sie beim
// Verbinden wird, steht in ihrer Systemeinstellung USB-Betriebsart.
//
// Weil das Display nicht lesbar ist, überwacht Boss 505 SkuConnect den Zustand laufend
// und meldet jede Änderung von selbst. So ist immer klar, woran man ist.
// =====================================================================

let letzterZustand = null;

// Die Namen der Speicherplätze aus dem zuletzt eingelesenen Stand. Im
// Bühnen-Modus gibt es kein Laufwerk, darum stammen sie aus der Kopie im
// Programmordner. So kann Boss 505 SkuConnect auch live sagen, wie ein Platz heißt.
let platzListe = null;

async function platzListeLaden() {
  const eigen = await window.skuConnect.datenordner();
  if (!eigen.ok || !eigen.vorhanden) return;
  const e = await window.skuConnect.speicherplaetzeLesen(eigen.pfad);
  if (e.ok) platzListe = e.plaetze;
}

// Beschreibt einen Speicherplatz so kurz wie möglich, mit Namen wenn bekannt.
function platzBeschreibung(nummer) {
  if (!nummer) return "Kein Platz gemeldet";
  const p = platzListe && platzListe.find(x => x.nummer === nummer);
  if (!p) return "Platz " + nummer;
  const name = (p.name || "").trim();
  const inhalt = p.spuren === 0 ? "leer" : p.spuren + " Spuren";
  return "Platz " + nummer + (name ? ", " + name : "") + ", " + inhalt;
}

async function zustandLesen() {
  const l = await window.skuConnect.laufwerkDa();
  if (l.ok && l.gefunden) return "werkstatt";
  if (typeof midiHatStation === "function" && midiHatStation()) return "buehne";
  return "getrennt";
}

function zustandText(z) {
  if (z === "werkstatt") return "Werkstatt, Datenmodus";
  if (z === "buehne") return "Bühne, Audio und MIDI";
  return "Station nicht verbunden";
}

// Das Gerät, auf dem die Sprachausgabe und der Systemton bleiben sollen.
// Windows greift sich beim Erscheinen der Station gern die Wiedergabe. Für
// einen blinden Nutzer ist das gefährlich, weil der Ton dann unbemerkt
// woanders landet. Darum holt Boss 505 SkuConnect die Wiedergabe bei jedem Wechsel zurück.
const HOERGERAET = "G733";

async function wiedergabeSichern() {
  const e = await window.skuConnect.audioGeraete("setze", HOERGERAET, "wiedergabe");
  if (!e.ok || e.problem) return null;
  return e.gesetzt;
}

async function zustandPruefen(ansagen) {
  const z = await zustandLesen();
  if (z !== letzterZustand) {
    const vorher = letzterZustand;
    letzterZustand = z;
    // Bei jedem Wechsel die Erkennung zurücksetzen, damit Boss 505 SkuConnect nicht mit
    // einem veralteten Pfad weiterarbeitet.
    stationsPfad = null;
    schreibbar = false;

    // Erscheint die Station als Audiogerät, sichert Windows sich meist die
    // Wiedergabe. Das wird sofort rückgängig gemacht.
    let zusatz = "";
    if (z === "buehne") {
      const geraet = await wiedergabeSichern();
      if (geraet) zusatz = ", Ton bleibt auf dem Headset";
    }
    if (ansagen && vorher !== null) sage(zustandText(z) + zusatz);
  }
  return z;
}

async function betriebsartAnsagen(li) {
  const z = await zustandLesen();
  letzterZustand = z;
  const zeilen = [zustandText(z)];
  if (z === "werkstatt") {
    zeilen.push("Einstellen ist möglich", "Spielen mit gestecktem USB nicht");
  } else if (z === "buehne") {
    zeilen.push("Spielen ist möglich", "Ansager, Fernbedienung und Aufnahme gehen");
    zeilen.push("Einstellungen sind jetzt nicht erreichbar");
  } else {
    zeilen.push("Kein Laufwerk und kein MIDI-Gerät", "USB einschalten oder Station einschalten");
  }
  ergebnis(li, zustandText(z), zeilen);
}

// Stellt die Betriebsart um. ziel ist buehne oder werkstatt.
// Ein Schritt je Zeile. Beim Wandern mit Pfeil runter liest die Sprachausgabe
// genau einen Schritt vor, Enter wiederholt ihn. Bühne und Werkstatt laufen
// gleich, nur die Drehrichtung beim Wert und der Abschluss sind verschieden.
function schritteFuer(ziel) {
  const nachWerkstatt = ziel === "werkstatt";
  const dreh = nachWerkstatt ? "nach links" : "nach rechts";
  const wert = nachWerkstatt ? "das ist STORAGE, der Datenmodus"
                             : "das ist AUDIO MIDI, die Bühne";
  const schluss = nachWerkstatt ? "Schritt 14, hier im Programm Station suchen wählen"
                                : "Schritt 14, hier im Programm Betriebsart ansagen wählen";
  return [
    "Schritt 1, drei Mal EXIT drücken",
    "Schritt 2, ein Mal SYSTEM drücken, du stehst auf Eintrag 1",
    "Schritt 3, elf Mal Pfeil rechts drücken, du stehst auf dem Anker",
    "Schritt 4, Regler eine Raste nach links drehen",
    "Schritt 5, ins Mikrofon sprechen",
    "Schritt 6, wird das Mikrofon in der Box stumm, stehst du richtig",
    "Schritt 7, Regler sofort eine Raste nach rechts zurück",
    "Schritt 8, bleibt das Mikrofon hörbar, EXIT drücken und bei Schritt 1 neu beginnen",
    "Schritt 9, zwei Mal Pfeil rechts drücken, du stehst auf der USB-Betriebsart",
    "Schritt 10, Regler eine Raste " + dreh + " drehen, " + wert,
    "Schritt 11, ein Mal EXIT drücken",
    "Schritt 12, Station ausschalten und wieder einschalten",
    "Schritt 13, USB abziehen und neu stecken",
    schluss
  ];
}

async function betriebsartWechseln(li, ziel) {
  const z = await zustandLesen();
  letzterZustand = z;

  if (z === ziel) {
    ergebnis(li, "Steht schon auf " + zustandText(ziel), null);
    return;
  }

  // Schreiben geht nur, solange die Station als Laufwerk da ist.
  if (z === "werkstatt") {
    const pfad = await quelleSichern();
    if (!pfad || !schreibbar) { sage("Station nicht erreichbar"); return; }
    const e = await window.skuConnect.wertSchreiben(pfad, {
      datei: "SYSTEM", nummer: 0, abschnitt: "USB", feld: "Mod",
      wert: ziel === "buehne" ? "1" : "0"
    });
    if (!e.ok) { ergebnis(li, "Fehler beim Schreiben", ["Fehler", e.fehler]); return; }
    if (e.geaendert && !e.bestaetigt) {
      ergebnis(li, "Achtung, Kontrolle fehlgeschlagen",
        ["Der Wert wurde nicht bestätigt", "Gelesen: " + e.gelesen]);
      return;
    }
    ergebnis(li, "Eingestellt, jetzt Station aus und wieder ein", [
      "Betriebsart auf " + zustandText(ziel) + " gesetzt und geprüft",
      "Wichtig: Die Station liest diese Einstellung nur beim Einschalten",
      "Ein bloßes Trennen der USB-Verbindung genügt nicht",
      "Schritt 1: Netzknopf drücken und halten, bis die Station aus ist",
      "Schritt 2: Netzknopf wieder drücken, ein paar Sekunden warten",
      "Schritt 3: USB verbinden",
      "Boss 505 SkuConnect sagt von selbst an, was danach da ist"
    ]);
    return;
  }

  // In der Bühne gibt es kein Laufwerk. Dafür reagiert dort das Bedienfeld,
  // also geht es am Gerät. Der Regler-Schritt ist der entscheidende, er wird
  // am häufigsten vergessen.
  ergebnis(li, "Das geht nur am Gerät", [
    "Im Bühnen-Modus gibt es kein Laufwerk, das Programm kann nichts schreiben",
    "Dafür reagiert jetzt das Bedienfeld der Station",
    "Die Schritte stehen daneben unter Anleitung zum Umstellen"
  ]);
}

// =====================================================================
// Profile
//
// Ein Profil stellt in einem Zug die Station und die Audiogeräte von Windows
// so ein, wie es für eine bestimmte Arbeitsweise passt. Damit entfällt das
// Zusammensuchen einzelner Einstellungen.
//
// Die Werte der Station lassen sich nur im Werkstatt-Modus schreiben, die
// Windows-Geräte dagegen immer. Boss 505 SkuConnect macht darum so viel wie möglich und
// sagt ehrlich, was noch fehlt.
// =====================================================================

const PROFILE = [
  {
    id: "profil-ueben", text: "Üben, allein spielen",
    station: { "USB.Mod": "1", "USB.AuRouting": "0" },
    wiedergabe: "G733", aufnahme: "G733",
    vorschau: [
      "Danach ist eingestellt:",
      "Station: Bühnen-Modus, spielbereit",
      "Stationston geht an die Box, nicht in den Rechner",
      "Windows hört: Headset G733",
      "Windows nimmt auf: Headset-Mikrofon G733",
      "Discord hört dich mit dem Headset-Mikrofon, ohne Loops",
      "Zum Üben allein, ohne dass etwas in den Rechner läuft"
    ],
    hinweise: [
      "Eingestellt: Station im Bühnen-Modus, Ton an die Box",
      "Windows hört und nimmt auf mit dem Headset G733"
    ]
  },
  {
    id: "profil-discord", text: "Discord, Stimme und Loops senden",
    station: { "USB.Mod": "1", "USB.AuRouting": "0" },
    wiedergabe: "G733", aufnahme: "RC-505",
    vorschau: [
      "Danach ist eingestellt:",
      "Station: Bühnen-Modus, spielbereit",
      "Windows hört: Headset G733",
      "Windows nimmt auf: RC-505, also den Mix der Station",
      "Discord hört alles, was aus der Station kommt:",
      "das Mikrofon an der Station, den AUX-Eingang und die Schleifen",
      "Discord hört das Headset-Mikrofon nicht mehr",
      "Die Mitspieler hörst du auf dem Headset, das verhindert Rückkopplung",
      "Wichtig: in Discord Rauschunterdrückung und Echounterdrückung aus,",
      "sonst zerhackt Discord die Musik"
    ],
    hinweise: [
      "Eingestellt: Discord hört jetzt den Mix der Station, nicht das Headset-Mikrofon",
      "Windows hört weiter auf dem Headset G733",
      "In Discord Rauschunterdrückung und Echounterdrückung ausschalten"
    ]
  },
  {
    id: "profil-audacity", text: "Audacity, Datei in die Station spielen",
    station: { "USB.Mod": "1", "USB.AuRouting": "2" },
    wiedergabe: "G733", aufnahme: "G733",
    vorschau: [
      "Danach ist eingestellt:",
      "Station: Bühnen-Modus, spielbereit",
      "USB-Audio-Ziel der Station: Loop In",
      "Das heißt, was der Rechner sendet, landet im Eingang des Loopers",
      "und lässt sich dort aufnehmen",
      "Windows hört: Headset G733",
      "Windows nimmt auf: Headset-Mikrofon G733",
      "In Audacity die Wiedergabe auf OUT RC-505 stellen",
      "In Audacity die Aufnahme auf IN RC-505 stellen",
      "Windows bleibt bewusst auf dem Headset, damit kein Systemton in die Schleife gerät"
    ],
    hinweise: [
      "Eingestellt: USB-Audio geht in den Looper, Loop In",
      "In Audacity Wiedergabe auf OUT RC-505, Aufnahme auf IN RC-505",
      "Windows hört und nimmt auf mit dem Headset G733"
    ]
  },
  {
    // Ohne Eintrag bei station bleibt die Station unangetastet. Das Rode ist
    // ein USB-Mikrofon und hängt am Rechner, nicht an der Station.
    id: "profil-rode", text: "Rode-Mikrofon aufnehmen oder senden",
    station: {},
    wiedergabe: "G733", aufnahme: "RODE",
    vorschau: [
      "Danach ist eingestellt:",
      "Windows hört: Headset G733",
      "Windows nimmt auf: Rode NT-USB",
      "Discord hört dich mit dem Rode, nicht mit dem Headset-Mikrofon",
      "Audacity nimmt mit dem Rode auf",
      "Die Station wird nicht angefasst und bleibt, wie sie steht",
      "Steckt das Rode nicht, bleibt die Wiedergabe sicher auf dem Headset",
      "und Boss 505 SkuConnect sagt, dass die Aufnahme nicht gesetzt wurde"
    ],
    hinweise: [
      "Eingestellt: Windows nimmt mit dem Rode NT-USB auf",
      "Windows hört weiter auf dem Headset G733",
      "Die Station wurde nicht angefasst"
    ]
  }
];

async function profilSetzen(li, profil) {
  sage("Stelle " + profil.text + " ein");
  const zeilen = [];
  let kurz = profil.text + " gesetzt";

  // 1. Die Station, sofern das Profil überhaupt Werte für sie hat.
  const hatStationswerte = Object.keys(profil.station).length > 0;
  const z = hatStationswerte ? await zustandLesen() : null;
  if (!hatStationswerte) {
    zeilen.push("Dieses Profil ändert nur den Rechner, die Station bleibt unverändert");
  } else if (z === "werkstatt") {
    const pfad = await quelleSichern();
    for (const schluessel of Object.keys(profil.station)) {
      const teile = schluessel.split(".");
      const wert = profil.station[schluessel];
      const e = await window.skuConnect.wertSchreiben(pfad, {
        datei: "SYSTEM", nummer: 0, abschnitt: teile[0], feld: teile[1], wert
      });
      const b = feldBeschreibung(teile[0], teile[1]);
      const name = b ? b.text : schluessel;
      if (!e.ok) zeilen.push(name + ": Fehler, " + e.fehler);
      else if (!e.geaendert) zeilen.push(name + ": stand schon richtig");
      else if (e.bestaetigt) zeilen.push(name + ": gesetzt auf " + wertText(b ? b.art : "zahl", wert, b));
      else zeilen.push(name + ": Achtung, nicht bestätigt");
    }
    if (profil.station["USB.Mod"] !== undefined) {
      zeilen.push("Die Betriebsart greift erst nach Aus- und Einschalten der Station");
    }
  } else {
    zeilen.push("Station nicht als Laufwerk da, ihre Werte bleiben unverändert");
    zeilen.push("Nur im Werkstatt-Modus lassen sich die Werte der Station schreiben");
  }

  // 2. Die Audiogeräte von Windows, das geht immer.
  for (const paar of [["wiedergabe", profil.wiedergabe], ["aufnahme", profil.aufnahme]]) {
    const e = await window.skuConnect.audioGeraete("setze", paar[1], paar[0]);
    const wort = paar[0] === "wiedergabe" ? "Wiedergabe" : "Aufnahme";
    if (!e.ok || e.problem) {
      zeilen.push(wort + ": nicht gesetzt, " + ((e && e.problem) || e.fehler));
      kurz = profil.text + ", teilweise gesetzt";
    } else {
      zeilen.push(wort + ": " + e.gesetzt);
    }
  }

  for (const h of profil.hinweise) zeilen.push(h);
  ergebnis(li, kurz, zeilen);
}

// Notfall: alles auf den Stand zurück, mit dem der Rechner sicher bedienbar
// ist. Wiedergabe und Aufnahme zurück auf das Headset. Erreichbar über den
// Menüpunkt und über Strg und Punkt, das wirkt im ganzen System.
async function allesZurueck(li) {
  const zeilen = [];
  let gut = 0;

  const w = await window.skuConnect.audioGeraete("setze", HOERGERAET, "wiedergabe");
  if (w.ok && !w.problem) { zeilen.push("Wiedergabe: " + w.gesetzt); gut++; }
  else zeilen.push("Wiedergabe nicht gesetzt: " + ((w && w.problem) || w.fehler));

  const a = await window.skuConnect.audioGeraete("setze", HOERGERAET, "aufnahme");
  if (a.ok && !a.problem) { zeilen.push("Aufnahme: " + a.gesetzt); gut++; }
  else zeilen.push("Aufnahme nicht gesetzt: " + ((a && a.problem) || a.fehler));

  zeilen.push("Die Station selbst wurde nicht angefasst");
  zeilen.push("Erreichbar auch über Strg und Punkt, im ganzen System");

  const kurz = gut === 2 ? "Ton zurück auf dem Headset"
    : gut === 1 ? "Teilweise zurückgesetzt"
    : "Headset nicht gefunden, steckt der Dongle?";
  ergebnis(li, kurz, zeilen);

  // Hörbare Bestätigung. Sie kommt über das gerade gesetzte Gerät, ist also
  // zugleich der Beweis, dass der Ton wieder da ist. Das ist wichtiger als
  // die gesprochene Meldung, denn die hört man nur, wenn Boss 505 SkuConnect vorn ist.
  if (gut > 0) window.setTimeout(spieleHauptmenue, 250);
}

async function audioAnsagen(li) {
  const e = await window.skuConnect.audioGeraete("liste");
  if (!e.ok || e.problem) { ergebnis(li, "Konnte die Geräte nicht lesen", ["Fehler", (e && e.problem) || e.fehler]); return; }
  const standard = e.geraete.filter(g => g.standard);
  const zeilen = e.geraete.map(g => g.art + ": " + g.name + (g.standard ? ", Standard" : ""));
  const kurz = standard.map(g => g.art + " " + g.name).join(", ") || "Keine Standardgeräte";
  ergebnis(li, kurz, zeilen);
}

async function usbVorbereiten(li) {
  sage("Bereite Trennung vor");
  stationsPfad = null;
  schreibbar = false;
  const e = await window.skuConnect.usbSteuern("vorbereiten");
  if (!e.ok) { ergebnis(li, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.problem) { ergebnis(li, "Hat nicht geklappt", ["Fehler", e.problem]); return; }

  ergebnis(li, "Bereit, jetzt am Gerät EXIT drücken", [
    "Die Schreibpuffer sind geleert, es kann nichts verloren gehen",
    "Schritt 1: am Gerät EXIT drücken",
    "Schritt 2: im Display steht Disconnect OK, mit WRITE bestätigen",
    "Danach reagiert das Bedienfeld wieder",
    "Betriebsart umstellen: SYSTEM ein Mal, dann Pfeil rechts dreizehn Mal, Regler eine Raste, EXIT",
    "Meldet sich die Station nicht von selbst, hier Verbindung erneuern wählen"
  ]);
}

async function usbErneuern(li) {
  sage("Erneuere Verbindung");
  stationsPfad = null;
  schreibbar = false;
  const e = await window.skuConnect.usbSteuern("erneuern");
  if (!e.ok) { ergebnis(li, "Fehler", ["Fehler", e.fehler]); return; }
  if (e.problem) { ergebnis(li, "Hat nicht geklappt", ["Fehler", e.problem]); return; }
  const zustand = e.zustand === "SPEICHER" ? "Speicher-Modus"
    : e.zustand === "AUDIO" ? "Audio und MIDI"
    : "nicht angemeldet";
  ergebnis(li, "Station im " + zustand, [
    "Zustand der Verbindung",
    "Station jetzt im " + zustand,
    e.zustand === "GETRENNT" ? "Die Station meldet sich von selbst, sobald sie bereit ist" : "Verbindung steht"
  ]);
}

async function inGitSichern(li) {
  const e = await window.skuConnect.gitSichern("Stationsdaten gesichert");
  if (!e.ok) { ergebnis(li, "Fehler beim Sichern", ["Fehler", e.fehler]); return; }
  ergebnis(li, e.neu ? "In Git gesichert" : "Nichts Neues zu sichern", [e.meldung]);
}

// =====================================================================
// Menü
// =====================================================================

const menue = [
  { typ: "ordner", text: "Werkstatt", kinder: [
    { typ: "aktion", id: "station-suchen", text: "Station suchen" },
    { typ: "ordner", text: "Track-Profile", laden: "profile" },
    { typ: "ordner", text: "Speicherplatz Auswahl", kinder: [
      { typ: "aktion", id: "platz-laden", text: "Speicherplätze laden" }
    ]},
    { typ: "ordner", text: "Track menü", laden: "trackmenu" },
    { typ: "ordner", text: "Memory menü", laden: "memorymenu" },
    { typ: "ordner", text: "System menü", laden: "systemmenu" },
    { typ: "ordner", text: "Write menü", kinder: [
      { typ: "ordner", text: "Write to, auf einen anderen Platz schreiben", laden: "zielplatz", id: "kopieren-nach" },
      { typ: "ordner", text: "Exchange, mit einem anderen Platz tauschen", laden: "zielplatz", id: "tauschen-mit" },
      { typ: "ordner", text: "Initialize, Platz löschen und zurücksetzen", laden: "initfrage" },
      { typ: "ordner", text: "Copy Track, Spur aus einem anderen Platz holen", laden: "ct-quelle" }
    ]}
  ]},
  { typ: "ordner", text: "Live-Studio", kinder: liveMenue() },
  { typ: "ordner", text: "Profile", kinder: [
    { typ: "aktion", id: "audio-ansagen", text: "Audiogeräte ansagen" },
    { typ: "aktion", id: "ton-zurueck", text: "Ton zurück auf das Headset" },
    { typ: "aktion", id: "alles-zurueck", text: "Alles auf Standard zurück, Strg Punkt",
      vorschau: [
        "Danach ist eingestellt:",
        "Windows hört: Headset G733",
        "Windows nimmt auf: Headset-Mikrofon G733",
        "Die Station wird nicht angefasst",
        "Zur Bestätigung erklingt ein Zweiklang über das gesetzte Gerät",
        "Dieselbe Taste wirkt im ganzen System: Strg und Punkt",
        "auch wenn Boss 505 SkuConnect gar nicht im Vordergrund ist"
      ] }
  ].concat(PROFILE.map(p => ({ typ: "aktion", id: p.id, text: p.text, vorschau: p.vorschau }))) },
  { typ: "ordner", text: "Betriebsart und USB", kinder: [
    { typ: "aktion", id: "art-ansagen", text: "Betriebsart ansagen" },
    { typ: "ordner", text: "Auf Bühne umstellen, Audio und MIDI", kinder: [
      { typ: "ordner", text: "Anleitung zum Umstellen", laden: "schritte-buehne" },
      { typ: "aktion", id: "art-buehne", text: "Jetzt umstellen, vom Programm aus" }
    ]},
    { typ: "ordner", text: "Auf Werkstatt umstellen, Datenmodus", kinder: [
      { typ: "ordner", text: "Anleitung zum Umstellen", laden: "schritte-werkstatt" },
      { typ: "aktion", id: "art-werkstatt", text: "Jetzt umstellen, vom Programm aus" }
    ]},
    { typ: "aktion", id: "usb-vorbereiten", text: "Trennung vorbereiten" },
    { typ: "aktion", id: "usb-erneuern", text: "Verbindung erneuern" }
  ]},
  { typ: "ordner", text: "Optionen", kinder: [
    { typ: "aktion", id: "ueber", text: "Über Boss 505 SkuConnect" },
    { typ: "aktion", id: "treiber", text: "Roland-Treiber prüfen und einrichten" },
    { typ: "ordner", text: "Loop-Aufnahmen der Spuren", laden: "loops" },
    { typ: "aktion", id: "sicherung-klein", text: "Sicherung anlegen, nur Einstellungen" },
    { typ: "aktion", id: "sicherung-gross", text: "Sicherung anlegen, mit Loops, dauert lange" },
    { typ: "aktion", id: "git-sichern", text: "Stand in Git sichern" },
    { typ: "aktion", id: "ausgabeordner", text: "Ausgabeordner ansagen",
      vorschau: [
        "Nennt den Ordner, in dem alle Ausgaben landen",
        "Dorthin gehen exportierte Loops und eigene Aufnahmen",
        "Der Ordner wird angelegt, falls er fehlt"
      ] }
  ]},
  { typ: "aktion", id: "beenden", text: "Beenden" }
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
    case "ausgabeordner": {
      const e = await window.skuConnect.ausgabeordner();
      if (e.ok) ergebnis(li, "Ausgaben liegen in " + e.pfad.split("\\").pop(), ["Vollständiger Pfad", e.pfad]);
      else ergebnis(li, "Konnte den Ordner nicht bestimmen", ["Fehler", e.fehler]);
      return;
    }
    case "ueber": sage("Boss 505 SkuConnect Version 0.45"); return;
    case "station-suchen": await stationSuchen(li); return;
    case "platz-laden": await speicherplaetzeLaden(li); return;
    case "schritt": sage(li.dataset.text); return;
    case "profil-neu": await profilNeu(li); return;
    case "profil-platz": await profilSchreiben(li, null); return;
    case "profil-alle": await profilSchreiben(li, "alle"); return;
    case "profil-ueberschreiben": await profilNeu(li, li.dataset.ziel); return;
    case "profil-umbenennen": await profilUmbenennen(li); return;
    case "profil-weg": await profilWeg(li); return;
    case "profil-abbrechen": sage("Abgebrochen, nichts geändert"); return;
    case "init-abbrechen": sage("Abgebrochen, nichts geändert"); return;
    case "init-ausfuehren": await platzInitialisieren(li); return;
    case "ct-ausfuehren": await spurKopieren(li); return;
    case "sicherung-klein": await sicherungAnlegen(li, false); return;
    case "sicherung-gross": await sicherungAnlegen(li, true); return;
    case "platz-waehlen": platzWaehlen(li); return;
    case "audio-ansagen": await audioAnsagen(li); return;
    case "alles-zurueck": await allesZurueck(li); return;
    case "ton-zurueck": {
      const geraet = await wiedergabeSichern();
      if (geraet) ergebnis(li, "Ton auf " + geraet, ["Wiedergabe zurückgeholt", geraet]);
      else ergebnis(li, "Headset nicht gefunden", ["Das Gerät " + HOERGERAET + " ist gerade nicht da",
        "Steckt der Dongle?"]);
      return;
    }
    case "art-ansagen": await betriebsartAnsagen(li); return;
    case "art-buehne": await betriebsartWechseln(li, "buehne"); return;
    case "art-werkstatt": await betriebsartWechseln(li, "werkstatt"); return;
    case "usb-vorbereiten": await usbVorbereiten(li); return;
    case "usb-erneuern": await usbErneuern(li); return;
    case "treiber": await treiberEinrichten(li, false); return;
    case "git-sichern": await inGitSichern(li); return;
    case "name-aendern": await nameAendern(li); return;
    case "kopieren-nach": await platzUebertragen(li, false); return;
    case "tauschen-mit": await platzUebertragen(li, true); return;
    case "loop-export": await loopExportieren(li); return;
    case "loop-import": await loopImportieren(li); return;
    case "midi-verbinden": await midiVerbinden(li); return;
    case "metronom": metronomUmschalten(li); return;
    case "metronom-wert": metronomWert(li); return;
    case "fx-ansage": fxAnsageUmschalten(li); return;
    case "usb-ton": await usbTonUmschalten(li); return;
    case "uhr-pruefen": uhrPruefen(li); return;
    case "ansager": ansagerUmschalten(li); return;
    case "platz-ansagen": platzAnsagen(li); return;
    case "tempo-ansagen": tempoAnsagen(li); return;
    case "midi-platz": platzUmschalten(li); return;
    case "midi-cc": steuerbefehlSenden(li); return;
    case "midi-kanal": kanalSetzen(li); return;
    case "aufnahme-start": await aufnahmeStarten(li); return;
    case "aufnahme-stopp": await aufnahmeStoppen(li); return;
    case "nur-lesen": sage("Lässt sich hier nicht ändern"); return;
    default: {
      const profil = PROFILE.find(p => p.id === li.dataset.id);
      if (profil) { await profilSetzen(li, profil); return; }
      sage(li.dataset.text);
      return;
    }
  }
}

baumElement.addEventListener("keydown", async (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || !aktiv.classList || !aktiv.classList.contains("eintrag")) return;

  // Sammelt der Filter gerade Buchstaben, zeigt Pfeil runter das Ergebnis.
  if (ereignis.key === "ArrowDown" && filterSammelt) {
    ereignis.preventDefault();
    filterAnwenden(aktiv);
    return;
  }

  const ebene = ebenenEintraege(aktiv);
  const index = ebene.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      if (index >= ebene.length - 1) spieleAnschlag(); else fokussiere(ebene[index + 1]);
      return;
    case "ArrowUp":
      ereignis.preventDefault();
      if (index <= 0) spieleAnschlag(); else fokussiere(ebene[index - 1]);
      return;
    case "Home":
      ereignis.preventDefault();
      if (index === 0) spieleAnschlag();
      fokussiere(ebene[0]);
      return;
    case "End":
      ereignis.preventDefault();
      if (index === ebene.length - 1) spieleAnschlag();
      fokussiere(ebene[ebene.length - 1]);
      return;
    case "ArrowRight":
      ereignis.preventDefault();
      await hineingehen(aktiv);
      return;
    case "ArrowLeft":
    case "Backspace":
      ereignis.preventDefault();
      ebeneZurueck(aktiv);
      return;
    case "Enter":
      ereignis.preventDefault();
      filterAufheben(true);
      await aktiviere(aktiv);
      return;
    case "Escape":
      ereignis.preventDefault();
      // Wie die Rücktaste: eine Ebene zurück, ohne etwas zu ändern.
      ebeneZurueck(aktiv);
      return;
    case "PageDown": {
      ereignis.preventDefault();
      const ziel = Math.min(index + 10, ebene.length - 1);
      if (ziel === index) spieleAnschlag();
      fokussiere(ebene[ziel]);
      return;
    }
    case "PageUp": {
      ereignis.preventDefault();
      const ziel = Math.max(index - 10, 0);
      if (ziel === index) spieleAnschlag();
      fokussiere(ebene[ziel]);
      return;
    }
  }

  filterTaste(ereignis, aktiv);
});

baueEbene(menue, baumElement);

// Beim Start still fokussieren und erst danach eine einzige Ansage machen.
// Die kurze Verzoegerung laesst der Sprachausgabe Zeit, das Fenster selbst
// zu melden, sonst reden beide durcheinander.
fokussiere(baumElement.querySelector(".eintrag"), true);
window.setTimeout(() => {
  const erster = baumElement.querySelector(".eintrag");
  sage("Boss 505 SkuConnect bereit, " + (erster ? erster.dataset.ansage : ""));
}, 700);

// Der Roland-Treiber. Fehlt er, gibt es keinen Bühnen-Modus. Beim Start
// wird darum nachgesehen und, wenn er fehlt, gleich eingerichtet. Das
// Einrichten braucht eine Windows-Rückfrage, die der Nutzer bestätigt.
async function treiberEinrichten(li, beimStart) {
  const stand = await window.skuConnect.treiberPruefen();
  if (stand.installiert) {
    if (beimStart) return;
    ergebnis(li, "Treiber ist eingerichtet", [
      "Gefunden: " + stand.name,
      "Die Station kann als Audio- und MIDI-Gerät arbeiten"
    ]);
    return;
  }
  if (!stand.setupDa) {
    const zeilen = [
      "Der Roland-USB-Treiber fehlt",
      "Im Ordner Treiber liegt kein Setup",
      "Ohne Treiber gibt es keinen Bühnen-Modus"
    ];
    if (beimStart) sage(zeilen.join(". "));
    else ergebnis(li, "Treiber fehlt", zeilen);
    return;
  }
  sage("Der Roland-Treiber fehlt. Ich richte ihn jetzt ein. "
     + "Bitte die Rückfrage von Windows mit Ja bestätigen.");
  const e = await window.skuConnect.treiberInstallieren();
  const zeilen = e.fertig
    ? ["Eingerichtet: " + e.name,
       "Station aus und wieder ein, dann USB neu stecken"]
    : ["Nicht eingerichtet",
       e.grund || "Grund unbekannt",
       "Setup liegt hier: " + e.setup,
       "Ohne Treiber gibt es keinen Bühnen-Modus"];
  if (li) ergebnis(li, e.fertig ? "Treiber eingerichtet" : "Treiber nicht eingerichtet", zeilen);
  else sage((e.fertig ? "Treiber eingerichtet. " : "Treiber nicht eingerichtet. ") + zeilen.join(". "));
}

// MIDI still im Hintergrund verbinden und den Zustand ab jetzt überwachen.
// Beim ersten Blick wird noch nichts angesagt, danach jede Änderung.
(async () => {
  if (typeof midiStillVerbinden === "function") await midiStillVerbinden();
  await platzListeLaden();
  await zustandPruefen(false);
  if (midiZugang) {
    midiZugang.onstatechange = async () => {
      if (typeof midiStillVerbinden === "function") await midiStillVerbinden();
      await zustandPruefen(true);
    };
  }
  await treiberEinrichten(null, true);

  window.setInterval(() => zustandPruefen(true), 2000);

  // Nottaster aus dem Programmkern entgegennehmen.
  if (window.skuConnect.beiNottaster) {
    window.skuConnect.beiNottaster(() => { allesZurueck(null); });
  }
  // Und nachfragen, ob die Taste wirklich liegt. Belegt ein anderes Programm
  // sie schon, muss das gesagt werden, sonst verlässt man sich im Notfall auf
  // etwas, das gar nicht da ist.
  if (window.skuConnect.nottasterLiegt) {
    const liegt = await window.skuConnect.nottasterLiegt();
    if (!liegt) sage("Achtung, Strg und Punkt ist von einem anderen Programm belegt, der Nottaster wirkt nur im Menü");
  }
})();
