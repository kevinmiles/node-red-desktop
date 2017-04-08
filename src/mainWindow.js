const electron = require('electron');
const {app, Menu, BrowserWindow} = electron;

const EventEmitter = require('events').EventEmitter;
const path = require('path');
const fs = require('fs');

function MainWindow(opts) {
  EventEmitter.call(this);

  this.opts = opts || {};

  // Create the browser window.
  this.win = new BrowserWindow({
    kiosk: true,
    title: 'Node-RED',
    show: false,
    icon: path.join(__dirname, 'res/favicon.ico'),
    webPreferences: {
      nodeIntegration: false
    }
  });

  if (!this.opts.useDefaultMenuBar) {
    //disables default menu by default
    this.win.setMenu(null);
  } else if (typeof this.opts.menuTemplate === 'object') {
    //or set a personalized menu according to the configuration
    this.win.setMenu(Menu.buildFromTemplate(this.opts.menuTemplate));
  }

  this.win.on('unresponsive', () => console.log('Window became unresponsive'));
  this.win.on('responsive', () => console.log('Window became responsive again'));

  // try to reload page if it fails for not being available
  let webContents = this.win.webContents;

  webContents.on('crashed', (evt, killed) => {
    console.log(` ** Renderer Process ${killed ? 'was killed! (out of memory?)' : 'crashed!'} Exiting application **`);
    app.quit(); //TODO handle this with index.js::exitApp()
  });

  // Emitted when the window is closed.
  this.win.on('closed', () => {
    this.win = null;
  });

  // Emitted when the window is ready to be shown
  this.win.on('ready-to-show', () => {
    this.win && this.win.show();
  });

}

MainWindow.prototype.load = function load(url) {
  this.win && this.win.loadURL(url);
}

module.exports = MainWindow;
