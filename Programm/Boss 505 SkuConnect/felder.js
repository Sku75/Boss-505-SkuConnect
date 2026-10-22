// Beschreibung aller Felder der Station: Klartextname, Art und Wertebereich.
//
// Grundsatz: Nur Felder, die hier beschrieben sind, lassen sich ändern.
// Alles andere wird angezeigt, aber nicht geschrieben. So kann Boss 505 SkuConnect nie
// einen Wert in ein Feld schreiben, dessen erlaubten Bereich wir nicht kennen.
//
// Art:
//   liste       Auswahl aus festen Texten, der Zahlenwert ist die Position
//   zahl        Zahl von min bis max
//   tempo       Tempo, in der Datei mit zehn malgenommen (1086 heißt 108,6)
//   looplaenge  0 heißt AUTO, sonst die Anzahl Takte

const AUS_AN = ["Aus", "An"];

// ---------------------------------------------------------------------
// Die Effekttypen der RC-505 mit Firmware 2.0.
//
// Die Reihenfolge ist doppelt belegt: Sie entspricht der Aufzählung im
// Zusatzhandbuch zur Version 2.0 und zugleich der Reihenfolge, in der die
// Parameter dieser Effekte in der Gerätedatei stehen. Beide stimmen genau
// überein, darum gilt die Zuordnung als gesichert.
//
// Die vier Beat-Effekte ab 27 stehen im Handbuch am Ende der Liste und haben
// ihre Parameter in eigenen Abschnitten. Ihre Nummern sind abgeleitet.
// ---------------------------------------------------------------------

const FX_TYPEN = [
  "Filter", "Phaser", "Flanger", "Synth", "Lo-Fi", "Ring Modulator",
  "Guitar to Bass", "Slow Gear", "Transpose", "Pitch Bend", "Robot",
  "Vocal Dist", "Vocoder", "Dynamics", "Equalizer", "Isolator", "Oktave",
  "Panorama", "Tremolo", "Slicer", "Delay", "Panning Delay", "Tape Echo",
  "Granular Delay", "Roll", "Chorus", "Reverb",
  "Beat Repeat", "Beat Shift", "Beat Scatter", "Vinyl Flick"
];

// ---------------------------------------------------------------------
// Die Parameter der Effekte.
//
// Durchgehende Regler laufen von 0 bis 100 und sind änderbar. Felder, die
// eine Art oder ein Muster auswählen, bleiben gesperrt, solange ihr
// Wertebereich nicht am Gerät bestätigt ist. Sie werden aber angezeigt.
// ---------------------------------------------------------------------

const R = (text) => ({ text, art: "zahl", min: 0, max: 100 });
const NUR = (text) => ({ text, art: "zahl", nurLesen: true });

// Manche Effekt-Parameter gehen über 100 hinaus. Die Geschwindigkeiten nehmen
// oberhalb von 100 Notenwerte an, die Zeiten sind Millisekunden. Die Grenzen
// hier stammen aus den echten Daten der Station, nicht aus einer Vermutung.
const RATE = (text) => ({ text, art: "zahl", min: 0, max: 115 });
const ZEIT = (text) => ({ text, art: "zahl", min: 0, max: 1010 });

const FX_FELDER = {
  // Filter
  FilTyp:    { text: "Filter, Art", art: "liste", werte: ["Tiefpass", "Bandpass", "Hochpass"] },
  FilRat:    RATE("Filter, Geschwindigkeit"),
  FilDep:    R("Filter, Tiefe"),
  FilReso:   R("Filter, Resonanz"),
  FilCut:    R("Filter, Grenzfrequenz"),
  FilStpRat: NUR("Filter, Schritttempo"),
  // Phaser
  PhRat:    RATE("Phaser, Geschwindigkeit"),
  PhDep:    R("Phaser, Tiefe"),
  PhReso:   R("Phaser, Resonanz"),
  PhStpRat: NUR("Phaser, Schritttempo"),
  PhLvl:    R("Phaser, Pegel"),
  // Flanger
  FlRat:    RATE("Flanger, Geschwindigkeit"),
  FlDep:    R("Flanger, Tiefe"),
  FlReso:   R("Flanger, Resonanz"),
  FlStpRat: NUR("Flanger, Schritttempo"),
  FlLvl:    R("Flanger, Pegel"),
  // Synth
  SynFreq:  R("Synth, Frequenz"),
  SynReso:  R("Synth, Resonanz"),
  SynDecay: R("Synth, Ausklang"),
  SynBal:   R("Synth, Balance"),
  // Lo-Fi
  LoFiDep:  NUR("Lo-Fi, Bit-Tiefe"),
  LoFiSmpl: NUR("Lo-Fi, Abtastrate"),
  LoFiBal:  R("Lo-Fi, Balance"),
  // Ring Modulator
  RmFreq: R("Ring Modulator, Frequenz"),
  RmBal:  R("Ring Modulator, Balance"),
  // Guitar to Bass
  GToB: R("Guitar to Bass, Balance"),
  // Slow Gear
  SgSens:   R("Slow Gear, Empfindlichkeit"),
  SgRisTim: R("Slow Gear, Anstiegszeit"),
  SgLvl:    R("Slow Gear, Pegel"),
  // Transpose und Pitch Bend
  Trans: NUR("Transpose, Halbtöne"),
  PbPit: NUR("Pitch Bend, Tonhöhe"),
  PbBnd: R("Pitch Bend, Stärke"),
  // Robot
  RoboNote: NUR("Robot, Grundton"),
  RoboGen:  R("Robot, Klangfarbe"),
  // Vocal Dist
  DistDist: R("Vocal Dist, Verzerrung"),
  DistTon:  R("Vocal Dist, Klang"),
  DistLvl:  R("Vocal Dist, Pegel"),
  // Vocoder
  VocoCar:  NUR("Vocoder, Träger"),
  VocoSens: R("Vocoder, Empfindlichkeit"),
  VocoAtck: R("Vocoder, Ansprache"),
  VocoBal:  R("Vocoder, Balance"),
  // Dynamics
  DynmTyp:  NUR("Dynamics, Art"),
  DynmDynm: R("Dynamics, Stärke"),
  // Equalizer
  EqLo:   R("Equalizer, Bässe"),
  EqLoMd: R("Equalizer, untere Mitten"),
  EqHiMd: R("Equalizer, obere Mitten"),
  EqHi:   R("Equalizer, Höhen"),
  EqLvl:  R("Equalizer, Pegel"),
  // Isolator
  IsoBnd:    NUR("Isolator, Bereich"),
  IsoRat:    RATE("Isolator, Geschwindigkeit"),
  IsoDep:    R("Isolator, Tiefe"),
  IsoStpRat: NUR("Isolator, Schritttempo"),
  IsoLvl:    R("Isolator, Absenkung"),
  // Oktave
  OctMod: NUR("Oktave, Art"),
  OctLvl: R("Oktave, Pegel"),
  // Panorama
  PanTyp:    NUR("Panorama, Art"),
  PanRat:    RATE("Panorama, Geschwindigkeit"),
  PanDep:    R("Panorama, Tiefe"),
  PanStpRat: NUR("Panorama, Schritttempo"),
  PanPos:    R("Panorama, Position"),
  // Tremolo
  TrRat: RATE("Tremolo, Geschwindigkeit"),
  TrDep: R("Tremolo, Tiefe"),
  TrLvl: R("Tremolo, Pegel"),
  // Slicer
  SlPat: NUR("Slicer, Muster"),
  SlRat: RATE("Slicer, Geschwindigkeit"),
  SlDep: R("Slicer, Tiefe"),
  // Delay
  DlyTim: ZEIT("Delay, Zeit"),
  DlyFb:  R("Delay, Wiederholungen"),
  DlyLvl: R("Delay, Pegel"),
  // Panning Delay
  PanDlyTim: ZEIT("Panning Delay, Zeit"),
  PanDlyFb:  R("Panning Delay, Wiederholungen"),
  PanDlyLvl: R("Panning Delay, Pegel"),
  // Tape Echo
  EchRat: RATE("Tape Echo, Geschwindigkeit"),
  EchInt: R("Tape Echo, Intensität"),
  EchLvl: R("Tape Echo, Pegel"),
  // Granular Delay
  GraTim: R("Granular Delay, Zeit"),
  GraFb:  R("Granular Delay, Wiederholungen"),
  GraLvl: R("Granular Delay, Pegel"),
  // Roll
  RllTim: ZEIT("Roll, Zeit"),
  RllMod: NUR("Roll, Art"),
  RllFb:  R("Roll, Wiederholungen"),
  RllLvl: R("Roll, Pegel"),
  // Chorus
  ChoRat: RATE("Chorus, Geschwindigkeit"),
  ChoDep: R("Chorus, Tiefe"),
  ChoLvl: R("Chorus, Pegel"),
  // Reverb
  RevTim:  R("Reverb, Länge"),
  RevLvl:  R("Reverb, Pegel"),
  RevDLvl: R("Reverb, Direktpegel"),
  // Beat-Effekte
  RepTyp:   NUR("Beat Repeat, Art"),
  RepLen:   NUR("Beat Repeat, Länge"),
  ShftTyp:  NUR("Beat Shift, Art"),
  ShftShft: NUR("Beat Shift, Versatz"),
  ScatTyp:  NUR("Beat Scatter, Art"),
  ScatLen:  NUR("Beat Scatter, Länge"),
  Flick:    NUR("Vinyl Flick, Stärke")
};

const MIDI_KANAELE = [];
for (let k = 1; k <= 16; k++) MIDI_KANAELE.push("Kanal " + k);

// Die Felder, die mehrere Spuren auf einmal meinen, stehen als Bitmuster in
// der Datei. Bit 1 ist Spur 1, der Wert 31 heisst also alle fuenf. Damit das
// vorlesbar wird, bekommt jede der 32 Möglichkeiten einen Klartext.
const SPUR_MUSTER = [];
for (let m = 0; m < 32; m++) {
  const dabei = [1, 2, 3, 4, 5].filter(s => m & (1 << (s - 1)));
  SPUR_MUSTER.push(
    dabei.length === 5 ? "alle fünf Spuren" :
    dabei.length === 0 ? "keine Spur" :
    (dabei.length === 1 ? "nur Spur " : "Spuren ") + dabei.join(" und ")
  );
}

const FELDER = {
  // --- Speicherplatz gesamt ---
  "MASTER.Lvl":   { text: "Speicher-Pegel, Gerät zeigt das Doppelte", art: "zahl", min: 0, max: 100 },
  "MASTER.Tmp":   { text: "Tempo", art: "tempo" },
  "MASTER.Cs":    { text: "Kompressor", art: "zahl", min: 0, max: 100 },
  "MASTER.Rv":    { text: "Hall", art: "zahl", min: 0, max: 100 },

  "REC_OPTION.DubMod":  { text: "Overdub-Art", art: "liste", werte: ["Overdub", "Ersetzen"] },
  "REC_OPTION.RecAct":  { text: "Tastenfolge", art: "liste", werte: ["Aufnahme, Overdub, Wiedergabe", "Aufnahme, Wiedergabe, Overdub"] },
  "REC_OPTION.RecQtz":  { text: "Aufnahme im Takt fangen", art: "liste", werte: AUS_AN },

  "PLAY_OPTION.LpLen":        { text: "Loop-Länge", art: "looplaenge" },
  "PLAY_OPTION.SinglePlyChg": { text: "Umschalten bei Einzelspur", art: "liste", werte: ["Sofort", "Am Schleifenende"] },
  "PLAY_OPTION.TgtTr":        { text: "Zielspur", art: "zahl", min: 0, max: 5 },

  // --- Je Spur, gilt für Spur 1 bis 5 ---
  "TRACK.Rev":     { text: "Rückwärts", art: "liste", werte: AUS_AN },
  "TRACK.PlyLvl":  { text: "Wiedergabepegel, Gerät zeigt das Doppelte", art: "zahl", min: 0, max: 100 },
  "TRACK.Pan":     { text: "Panorama", art: "zahl", min: 0, max: 100 },
  "TRACK.One":     { text: "One-Shot", art: "liste", werte: AUS_AN },
  "TRACK.TrkFx":   { text: "Track FX anwenden", art: "liste", werte: AUS_AN },
  "TRACK.PlyMod":  { text: "Abspielart", art: "liste", werte: ["Mehrspurig", "Einzelspur"] },
  "TRACK.LpSync":  { text: "Loop Sync", art: "liste", werte: AUS_AN },
  "TRACK.TmpSync": { text: "Tempo Sync", art: "liste", werte: AUS_AN },
  "TRACK.WavStat": { text: "Aufnahme vorhanden", art: "liste", werte: ["Nein", "Ja"], nurLesen: true },
  "TRACK.RecTmp":  { text: "Aufnahmetempo", art: "tempo", nurLesen: true },
  "TRACK.WavLen":  { text: "Aufnahmelänge", art: "zahl", nurLesen: true },

  // --- Rhythmus ---
  "RHYTHM.Sw":      { text: "Rhythmus", art: "liste", werte: AUS_AN },
  "RHYTHM.Lvl":     { text: "Rhythmus-Pegel, Gerät zeigt das Doppelte", art: "zahl", min: 0, max: 100 },
  "RHYTHM.Ptn":     { text: "Muster", art: "zahl", min: 0, max: 84 },
  "RHYTHM.LineOut": { text: "Nur auf Kopfhörer", art: "liste", werte: AUS_AN },
  "RHYTHM.RecCnt":  { text: "Einzähler vor Aufnahme", art: "liste", werte: AUS_AN },
  "RHYTHM.PlyCnt":  { text: "Einzähler vor Wiedergabe", art: "liste", werte: AUS_AN },

  // --- Effekt-Bänke Input FX und Track FX ---
  "FXBANK.Sw":   { text: "Effekte", art: "liste", werte: AUS_AN },
  "FXBANK.Sel":  { text: "Gewählte Taste", art: "liste", werte: ["A", "B", "C"] },
  "FXBANK.Typ1": { text: "Effekt Taste A", art: "liste", werte: FX_TYPEN },
  "FXBANK.Typ2": { text: "Effekt Taste B", art: "liste", werte: FX_TYPEN },
  "FXBANK.Typ3": { text: "Effekt Taste C", art: "liste", werte: FX_TYPEN },
  "FXBANK.MltSw":   { text: "Effekte im Multi-Betrieb", art: "liste", werte: AUS_AN },
  "FXBANK.MltTyp1": { text: "Multi, Effekt Taste A", art: "liste", werte: FX_TYPEN },
  "FXBANK.MltTyp2": { text: "Multi, Effekt Taste B", art: "liste", werte: FX_TYPEN },
  "FXBANK.MltTyp3": { text: "Multi, Effekt Taste C", art: "liste", werte: FX_TYPEN },

  // --- Assigns ---
  "ASSIGN.Sw":     { text: "Zuweisung", art: "liste", werte: AUS_AN },
  "ASSIGN.TgtMin": { text: "Kleinster Wert", art: "zahl", min: 0, max: 100 },
  "ASSIGN.TgtMax": { text: "Größter Wert", art: "zahl", min: 0, max: 100 },


  // --- Mit Version 0.33 entsperrt ---
  //
  // Startart und Stoppart: Handbuch Seite 13.
  "TRACK.StrtMod": { text: "Startart", art: "liste", werte: ["Sofort", "Einblenden"] },
  "TRACK.StpMod":  { text: "Stoppart", art: "liste", werte: ["Sofort", "Ausblenden", "Am Loopende"] },

  // Taktart: Handbuch Seite 19. Belegt durch die Gerätedaten, dort steht der
  // Wert 2 und das Gerät zeigt im Werkszustand 4/4, also beginnt die Zählung
  // bei 2/4 mit null.
  "RHYTHM.Bt": { text: "Taktart", art: "liste", werte: [
    "2/4", "3/4", "4/4", "5/4", "6/4", "7/4", "5/8", "6/8", "7/8",
    "8/8", "9/8", "10/8", "11/8", "12/8", "13/8", "14/8", "15/8"] },

  // Stopp-Verhalten des Rhythmus: Handbuch Seite 19. Der Werkswert 1
  // entspricht der dort genannten Voreinstellung LOOPER STOP.
  "RHYTHM.Stp": { text: "Rhythmus stoppt", art: "liste", werte: [
    "Nur über die Rhythmus-Taste", "Mit der Stopptaste", "Beim Umschalten auf Overdub oder Wiedergabe"] },

  // Korrektur des Aufnahmeendes: Handbuch Seite 16.
  "PLAY_OPTION.LpQtz": { text: "Loop Quantize", art: "liste", werte: [
    "Auf das Aufnahmeende", "Auf den Takt", "Auf den Taktschlag"] },

  // Kopfhörer-Ausgang: Zusatzanleitung 2.0.
  "MASTER.PhOut": { text: "Kopfhörer gibt aus", art: "liste", werte: ["Abhörsignal", "Hauptsignal"] },

  // Spuren-Auswahl, siehe SPUR_MUSTER.
  "MASTER.PhOutTr":      { text: "Kopfhörer-Spuren", art: "liste", werte: SPUR_MUSTER },
  "PLAY_OPTION.AllStrt": { text: "ALL START startet", art: "liste", werte: SPUR_MUSTER },
  "PLAY_OPTION.AllStp":  { text: "ALL STOP stoppt", art: "liste", werte: SPUR_MUSTER },

  // Fußtaster-Verhalten: Handbuch Seite 17. Die Gerätedaten stützen das,
  // Assign 1 am Expression-Pedal steht auf 0, Assign 2 am Fußtaster auf 1.
  "ASSIGN.SrcMod": { text: "Fußtaster arbeitet", art: "liste", werte: ["Tastend", "Umschaltend"] },

  // --- Systemeinstellungen der Station ---
  "SETUP.LcdContrast": { text: "Display-Helligkeit, Gerät zeigt eins mehr", art: "zahl", min: 0, max: 15 },
  "SETUP.PhantomPwr":  { text: "Phantomspeisung", art: "liste", werte: AUS_AN },
  "SETUP.AutoOff":     { text: "Automatisch ausschalten", art: "liste", werte: AUS_AN },
  "SETUP.IndMod":      { text: "Loop-Anzeige", art: "liste", werte: ["Status", "Loop-Position", "Pegel"] },

  "INPUT_OUTPUT.LineOutLvl": { text: "Ausgangspegel Line Out", art: "zahl", min: 0, max: 100 },
  "INPUT_OUTPUT.InLineOut":  { text: "Eingang auf Line Out", art: "liste", werte: AUS_AN },
  "INPUT_OUTPUT.OutLvlSel":  { text: "Output-Regler wirkt auf", art: "liste", werte: ["Line und Kopfhörer", "Nur Kopfhörer"] },

  // Die USB-Betriebsart lässt sich hier umstellen. Sie greift, sobald die
  // Station vom Rechner getrennt wird. Damit erspart man sich den Weg über
  // das Gerätemenü.
  "USB.Mod":       { text: "USB-Betriebsart", art: "liste", werte: ["Speicher-Modus", "Audio und MIDI"] },
  "USB.AuRouting": { text: "USB-Audio geht nach", art: "liste", werte: ["Line Out", "Sub Mix", "Loop In"] },
  "USB.InLvl":     { text: "USB-Eingangspegel", art: "zahl", min: 0, max: 100 },
  "USB.OutLvl":    { text: "USB-Ausgangspegel", art: "zahl", min: 0, max: 100 },

  "MIDI.RxCh":  { text: "MIDI-Empfangskanal", art: "liste", werte: MIDI_KANAELE },
  "MIDI.TxCh":  { text: "MIDI-Sendekanal", art: "liste", werte: MIDI_KANAELE.concat(["Wie Empfang"]) },
  "MIDI.Omni":  { text: "Auf allen Kanälen empfangen", art: "liste", werte: AUS_AN },
  "MIDI.Sync":  { text: "Tempo-Kopplung", art: "liste", werte: ["Automatisch", "Intern"] },
  "MIDI.InSel": { text: "Tempo-Quelle", art: "liste", werte: ["USB", "MIDI-Buchse"] },
  "MIDI.PcOut": { text: "Speicherplatz per MIDI melden", art: "liste", werte: AUS_AN }
};

// Lesbare Namen für Felder, die wir anzeigen, aber nicht ändern.
const NUR_ANZEIGE = {
  "PLAY_OPTION.LpMod": "Loop-Modus, Rohwert",
  "PLAY_OPTION.FadeTim": "Ein- und Ausblendzeit, Zählweise nicht belegt",
  "TRACK.MeasMod": "Takt-Modus, Zuordnung der Werte nicht belegt",
  "TRACK.MeasLen": "Taktzahl, hängt am Takt-Modus",
  "TRACK.MeasBtLp": "Takt-Schleife, hängt am Takt-Modus",
  "FXBANK.Mod": "Betriebsart, Rohwert",
  "FXBANK.MltMod": "Multi-Betriebsart, Rohwert",
  "ASSIGN.Src": "Quelle, nur die ersten drei Werte belegt",
  "ASSIGN.Tgt": "Ziel, Nummerierung nicht belegt",
  "SETUP.MemNum": "Zuletzt gewählter Speicherplatz",
  "SETUP.DispMod": "Anzeigeart des Startbildschirms, Rohwert",
  "SETUP.AllClr": "Alles löschen, Rohwert",
  "SETUP.QuickClr": "Schnelles Löschen, Rohwert",
  "SETUP.KnobMod": "Reglerverhalten, Rohwert",
  "INPUT_OUTPUT.InNsThrs": "Rauschunterdrückung, Rohwert",
  "INPUT_OUTPUT.InSrc": "Eingangsquelle, Rohwert"
};

// Liefert die Beschreibung eines Feldes. Abschnitte mit Nummer werden auf
// ihre Grundform zurückgeführt, TRACK3 wird also zu TRACK.
function grundform(abschnitt) {
  if (/^TRACK[1-5]$/.test(abschnitt)) return "TRACK";
  if (/^ASSIGN\d+$/.test(abschnitt)) return "ASSIGN";
  if (abschnitt === "INPUT_FX" || abschnitt === "TRACK_FX") return "FXBANK";
  if (/^(INPUT_FX|TRACK_FX|BEAT_FX)[123]$/.test(abschnitt)) return "FXPARAM";
  return abschnitt;
}

function feldBeschreibung(abschnitt, feld) {
  const form = grundform(abschnitt);
  if (form === "FXPARAM") return FX_FELDER[feld] || null;
  const schluessel = form + "." + feld;
  if (FELDER[schluessel]) return FELDER[schluessel];
  if (NUR_ANZEIGE[schluessel]) return { text: NUR_ANZEIGE[schluessel], art: "zahl", nurLesen: true };
  return null;
}
