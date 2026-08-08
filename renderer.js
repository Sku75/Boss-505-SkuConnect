// Sku505 Version 0.04.
// Baummenü nach Anforderungsprofil: Pfeil hoch/runter wandern in der Ebene,
// Pfeil rechts hinein, Pfeil links (auch Rücktaste) heraus, Enter aktiviert.

const menue = [
  {
    id: "werkstatt", text: "Werkstatt", typ: "ordner", kinder: [
      { id: "station-suchen", text: "Station suchen", typ: "aktion" },
      { id: "firmware", text: "Firmware und Datenstand prüfen", typ: "aktion" },
      { id: "speicherplaetze", text: "Speicherplätze", typ: "ordner", kinder: [
        { id: "platz-laden", text: "Speicherplätze laden", typ: "aktion" }
      ]},
      { id: "einlesen", text: "Einlesen", typ: "ordner", kinder: [
        { id: "einst-einlesen", text: "Einstellungen einlesen, schnell", typ: "aktion" },
        { id: "loops-einlesen", text: "Loop-Aufnahmen einlesen, dauert lange", typ: "aktion" }
      ]}
    ]
  },
  {
    id: "livestudio", text: "Live-Studio", typ: "ordner", kinder: [
      { id: "live-info", text: "Wird in einer späteren Stufe gebaut", typ: "aktion" }
    ]
  },
  {
    id: "optionen", text: "Optionen", typ: "ordner", kinder: [
      { id: "probe", text: "Probe-Bereich für die Abnahme", typ: "ordner", kinder: [
        { id: "test-schalter", text: "Testschalter", typ: "wert", wert: "Aus", auswahl: ["An", "Aus"] },
        { id: "test-effekt", text: "Test-Effekt", typ: "wert", wert: "Kein", auswahl: ["Kein", "Filter", "Phaser", "Flanger", "Delay", "Reverb"] },
        { id: "test-aktion", text: "Test-Aktion mit Ansage", typ: "aktion" }
      ]},
      { id: "ueber", text: "Über Sku505", typ: "aktion" }
    ]
  },
  { id: "beenden", text: "Sku505 beenden", typ: "aktion" }
];

const baumElement = document.getElementById("baum");
const statuszeile = document.getElementById("statuszeile");

let stationsPfad = null;

function sage(text) {
  statuszeile.textContent = text;
}

// Anschlagton wie in Skularis: erzeugter Ton, 220 Hertz, 400 ms.
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

function baueEbene(eintraege, elternListe, ebene) {
  for (const eintrag of eintraege) {
    const li = document.createElement("li");
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-level", String(ebene));
    li.dataset.id = eintrag.id;
    li.dataset.typ = eintrag.typ;
    li.tabIndex = -1;

    const zeile = document.createElement("span");
    zeile.className = "zeile";
    li.appendChild(zeile);
    elternListe.appendChild(li);

    if (eintrag.typ === "ordner") {
      li.setAttribute("aria-expanded", "false");
      const gruppe = document.createElement("ul");
      gruppe.setAttribute("role", "group");
      gruppe.hidden = true;
      baueEbene(eintrag.kinder, gruppe, ebene + 1);
      li.appendChild(gruppe);
    }

    if (eintrag.typ === "wert") {
      li.setAttribute("aria-expanded", "false");
      li.dataset.wert = eintrag.wert;
      const gruppe = document.createElement("ul");
      gruppe.setAttribute("role", "group");
      gruppe.hidden = true;
      for (const moeglichkeit of eintrag.auswahl) {
        const optionLi = document.createElement("li");
        optionLi.setAttribute("role", "treeitem");
        optionLi.setAttribute("aria-level", String(ebene + 1));
        optionLi.dataset.typ = "option";
        optionLi.dataset.option = moeglichkeit;
        optionLi.tabIndex = -1;
        const optionZeile = document.createElement("span");
        optionZeile.className = "zeile";
        optionZeile.textContent = moeglichkeit;
        optionLi.appendChild(optionZeile);
        gruppe.appendChild(optionLi);
      }
      li.appendChild(gruppe);
    }

    aktualisiereZeile(li, eintrag.text);
  }
}

// Ersetzt die Kinder eines Ordners, für nachgeladene Inhalte.
function setzeKinder(li, eintraege) {
  const alteGruppe = li.querySelector(':scope > ul[role="group"]');
  if (alteGruppe) alteGruppe.remove();
  const gruppe = document.createElement("ul");
  gruppe.setAttribute("role", "group");
  gruppe.hidden = true;
  const ebene = parseInt(li.getAttribute("aria-level"), 10) + 1;
  baueEbene(eintraege, gruppe, ebene);
  li.appendChild(gruppe);
}

function aktualisiereZeile(li, basisText) {
  const zeile = li.querySelector(":scope > .zeile");
  if (basisText) li.dataset.text = basisText;
  const text = li.dataset.text;
  if (li.dataset.typ === "wert") {
    zeile.textContent = text + ": " + li.dataset.wert;
  } else {
    zeile.textContent = text;
  }
}

function ebenenEintraege(li) {
  return Array.from(li.parentElement.children)
    .filter(e => e.getAttribute("role") === "treeitem");
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
  if (elternListe && elternListe.getAttribute("role") === "group") {
    return elternListe.parentElement;
  }
  return null;
}

function ebeneZurueck(aktiv) {
  if (aktiv.getAttribute("aria-expanded") === "true") {
    schliesse(aktiv);
    return;
  }
  const eltern = elternVon(aktiv);
  if (eltern) {
    schliesse(eltern);
    fokussiere(eltern);
  } else {
    spieleAnschlag();
  }
}

// --- Werkstatt ---

// Liefert den Pfad, aus dem gelesen wird: bevorzugt die angeschlossene Station,
// sonst der zuletzt eingelesene Datenbestand im Programmordner.
async function quellePfad() {
  if (stationsPfad) return stationsPfad;
  const gefunden = await window.sku505.stationSuchen();
  if (gefunden.gefunden) { stationsPfad = gefunden.rolandPfad; return stationsPfad; }
  const eigen = await window.sku505.datenordner();
  if (eigen.ok && eigen.vorhanden) return eigen.pfad;
  return null;
}

async function stationSuchen() {
  sage("Suche die Station...");
  const e = await window.sku505.stationSuchen();
  if (e.gefunden) {
    stationsPfad = e.rolandPfad;
    sage("Station gefunden auf Laufwerk " + e.laufwerk);
  } else {
    stationsPfad = null;
    sage("Keine Station gefunden. Sie muss im Speicher-Modus angeschlossen sein.");
  }
}

async function firmwarePruefen() {
  const p = await quellePfad();
  if (!p) { sage("Keine Daten vorhanden. Erst Station suchen."); return; }
  const e = await window.sku505.kenndatenLesen(p);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }
  const firmware = e.revision === "2" ? "Firmware 2.0" : "Datenstand " + e.revision;
  sage("Gerät " + e.geraet + ", " + firmware + ", Datenstand " + e.revision + ".");
}

async function einstellungenEinlesen() {
  const p = await quellePfad();
  if (!p) { sage("Keine Station gefunden."); return; }
  sage("Lese Einstellungen ein...");
  const e = await window.sku505.einstellungenEinlesen(p);
  if (e.ok) sage("Einstellungen eingelesen, " + Math.round(e.bytes / 1024) + " Kilobyte.");
  else sage("Fehler: " + e.fehler);
}

async function loopsEinlesen() {
  const p = await quellePfad();
  if (!p) { sage("Keine Station gefunden."); return; }
  sage("Lese Loop-Aufnahmen ein. Das dauert mehrere Minuten, das Menü bleibt bedienbar.");
  const e = await window.sku505.loopsEinlesen(p);
  if (e.ok && e.vollstaendig) sage("Loop-Aufnahmen eingelesen, " + e.kopie + " Dateien, vollständig.");
  else if (e.ok) sage("Achtung: unvollständig. Quelle " + e.quelle + ", Kopie " + e.kopie + ".");
  else sage("Fehler: " + e.fehler);
}

// Baut die Speicherplatz-Liste. Zeilen kurz halten, damit sie auf die
// 40 Zeichen der Braillezeile passen.
async function speicherplaetzeLaden(li) {
  const p = await quellePfad();
  if (!p) { sage("Keine Daten vorhanden. Erst Station suchen."); return; }
  sage("Lese Speicherplätze...");
  const e = await window.sku505.speicherplaetzeLesen(p);
  if (!e.ok) { sage("Fehler: " + e.fehler); return; }

  const ordner = li.closest('li[data-id="speicherplaetze"]') || elternVon(li);
  const eintraege = e.plaetze.map(pl => {
    const laenge = pl.lpLen === 0 ? "AUTO" : pl.lpLen + " Takte";
    const spuren = pl.spuren === 0 ? "leer" : pl.spuren + " Spuren";
    const nummer = String(pl.nummer).padStart(2, "0");
    return {
      id: "platz-" + pl.nummer,
      text: nummer + " " + pl.name + ", " + laenge + ", " + spuren,
      typ: "aktion"
    };
  });
  // Am Ende ein Eintrag zum erneuten Laden, damit die Liste nach
  // Aenderungen aktualisiert werden kann.
  eintraege.push({ id: "platz-laden", text: "Liste neu laden", typ: "aktion" });
  setzeKinder(ordner, eintraege);
  oeffne(ordner);
  fokussiere(ordner.querySelector(':scope > ul[role="group"] > li'));
  const belegt = e.plaetze.filter(x => x.spuren > 0).length;
  sage(e.plaetze.length + " Speicherplätze geladen, " + belegt + " davon belegt.");
}

function aktiviere(li) {
  const typ = li.dataset.typ;

  if (typ === "ordner" || typ === "wert") {
    if (oeffne(li)) fokussiere(li.querySelector(':scope > ul[role="group"] > li'));
    return;
  }

  if (typ === "option") {
    const wertZeile = elternVon(li);
    wertZeile.dataset.wert = li.dataset.option;
    aktualisiereZeile(wertZeile);
    schliesse(wertZeile);
    fokussiere(wertZeile);
    sage(wertZeile.dataset.text + " ist jetzt " + li.dataset.option);
    return;
  }

  const id = li.dataset.id;
  if (id === "beenden") { window.close(); return; }
  if (id === "ueber") { sage("Sku505 Version 0.04."); return; }
  if (id === "test-aktion") { sage("Test-Aktion ausgeführt. Ansagen funktionieren."); return; }
  if (id === "station-suchen") { stationSuchen(); return; }
  if (id === "firmware") { firmwarePruefen(); return; }
  if (id === "einst-einlesen") { einstellungenEinlesen(); return; }
  if (id === "loops-einlesen") { loopsEinlesen(); return; }
  if (id === "platz-laden") { speicherplaetzeLaden(li); return; }
  if (id && id.startsWith("platz-")) { sage(li.dataset.text + ". Bearbeiten kommt in der nächsten Version."); return; }
  sage(li.dataset.text + ": diese Funktion wird in einer späteren Version gebaut.");
}

baumElement.addEventListener("keydown", (ereignis) => {
  const aktiv = document.activeElement;
  if (!aktiv || aktiv.getAttribute("role") !== "treeitem") return;
  const ebene = ebenenEintraege(aktiv);
  const index = ebene.indexOf(aktiv);

  switch (ereignis.key) {
    case "ArrowDown":
      ereignis.preventDefault();
      if (index >= ebene.length - 1) spieleAnschlag();
      else fokussiere(ebene[index + 1]);
      break;
    case "ArrowUp":
      ereignis.preventDefault();
      if (index <= 0) spieleAnschlag();
      else fokussiere(ebene[index - 1]);
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
      if (aktiv.hasAttribute("aria-expanded")) {
        oeffne(aktiv);
        fokussiere(aktiv.querySelector(':scope > ul[role="group"] > li'));
      } else {
        spieleAnschlag();
      }
      break;
    case "ArrowLeft":
    case "Backspace":
      ereignis.preventDefault();
      ebeneZurueck(aktiv);
      break;
    case "Enter":
      ereignis.preventDefault();
      aktiviere(aktiv);
      break;
  }
});

baueEbene(menue, baumElement, 1);
fokussiere(baumElement.querySelector('li[role="treeitem"]'));
sage("Sku505 bereit.");
