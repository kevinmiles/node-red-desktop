'use strict';

const {BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const url = require('url');

function SplashScreen(opts) {
    this.opts = opts || {};

    let mainScreen = require('electron').screen.getPrimaryDisplay().bounds;
    let width = this.opts.width || 640;
    let height = this.opts.height || 480;
    let x = (mainScreen.width / 2) - (width / 2);
    let y = (mainScreen.height / 2) - (height / 2);

    this.win = new BrowserWindow({
        width,
        height,
        x,
        y,
        frame: this.opts.frame || false,
        icon: path.join(__dirname, 'res', process.platform == 'win32' ? 'favicon.ico' : 'favicon.png'),
        center: true,
        show: false,
        backgroundColor: this.opts.backgroundColor
    });

    this.win.loadURL(url.format({
        pathname: this.opts.path || path.join(__dirname, 'res/splash.html'),
        protocol: 'file:',
        slashes: true
    }));

    if(!this.opts.noAutoShow) {
        this.win.once('ready-to-show', () => {
            this.win.show();
        });
    }

    if(this.opts.debug) {
        this.win.webContents.openDevTools({mode: "undocked"});
    }
}

SplashScreen.prototype.showSplash = function showSplash() {
    this.win && this.win.show && this.win.show();
}

SplashScreen.prototype.close = function close() {
    this.win && this.win.destroy && this.win.destroy();
}

SplashScreen.prototype.setStatus = function setStatus(msg) {
    this.win && this.win.webContents.send('splash-status-message', msg);
}

module.exports = SplashScreen;