import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { applySchema } from './db/migrate';
import { runSeed } from './db/seed';
import { closeDb } from './db/client';
import { registerIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
  const isDev = !!process.env['ELECTRON_RENDERER_URL'];
  // Ícone do app (robô). __dirname é out/main em dev e dentro do asar quando
  // empacotado — em ambos ../../assets/icon.ico resolve pro arquivo gerado por
  // scripts/gen-icon.mjs. Define o ícone da janela/taskbar em vez do padrão Electron.
  const iconPath = path.join(__dirname, '../../assets/icon.ico');
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    icon: iconPath,
    // Janela redimensionável, mas com um piso para não quebrar o layout interno
    // (sidebar + topbar com busca de 360px). Abaixo disso o conteúdo estoura.
    // Sem maxWidth/maxHeight de propósito: limitá-los travaria o botão maximizar.
    minWidth: 1100,
    minHeight: 720,
    resizable: true,
    maximizable: true,
    minimizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#fbfbfd',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow = win;
  win.on('closed', () => { mainWindow = null; });
  return win;
}

app.whenReady().then(() => {
  applySchema();
  runSeed();

  // As oportunidades vêm exclusivamente dos JSON em {workspace}/freelas/ (as
  // raspagens são a fonte de verdade). O app não gera, não faz dump do banco e
  // não roda varredura automática que inventa dados — apenas lê a pasta.
  registerIpcHandlers(() => mainWindow);

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  closeDb();
});
