const { app, BrowserWindow } = require('electron');
const path = require('path');

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

app.whenReady().then(() => {
  erstelleFenster();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
