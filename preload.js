// Preload: Bruecke zwischen Oberflaeche und System.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sku505', {
  stationSuchen: () => ipcRenderer.invoke('station-suchen'),
  kenndatenLesen: (rolandPfad) => ipcRenderer.invoke('kenndaten-lesen', rolandPfad),
  datenEinlesen: (rolandPfad) => ipcRenderer.invoke('backup-erstellen', rolandPfad)
});
