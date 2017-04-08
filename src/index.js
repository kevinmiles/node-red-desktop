const {app} = require('electron');
const SplashScreen = require('./splash.js');
const MainWindow = require('./mainWindow.js');
const util = require("util");

var red;
var mainWindow;

//TODO selfUpdate
//TODO crashreporter

function exitApp() {
  //TODO gracefully exits NodeRED
  if (red && red.RED) {
    red.RED.stop().then(function() {
      app.quit();
    });
  } else {
    app.quit();
  }
}

function onReady() {
  //create and show splash as soon as possible
  let splash = new SplashScreen();

  // load and start NodeRED
  splash.setStatus('Loading...')
  red = require('./red.js');
  
  splash.setStatus('Initializing Node-RED...')
  red.init() || app.quit();

  //create main window
  splash.setStatus('Creating main window...')
  mainWindow = new MainWindow();
  mainWindow.win.on('ready-to-show', () => {
    splash.close();
  });

  //show main window when NodeRED is started
  splash.setStatus('Starting Node-RED engine...')
  red.start((err, path) => {
    if(err) {
      exitApp();
    } else {
      mainWindow.load(path);
    }
  });
}

app.on('ready', onReady);

app.on('window-all-closed', () => {
  exitApp();
});

app.on('gpu-process-crashed', (evt, killed) => {
  util.log(`Error - GPU Process ${killed ? 'was killed' : 'crashed'}! Exiting application`);
  exitApp();
});

process.on('uncaughtException',function(err) {
    util.log('Uncaught Exception:');
    if (err.stack) {
        util.log(err.stack);
    } else {
        util.log(err);
    }
    app.quit();
});

process.on('SIGINT', function () {
    exitApp();
});