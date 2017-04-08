/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
const http = require('http');
const util = require("util");
const url = require("url");
const express = require("express");
const crypto = require("crypto");
var bcrypt;
try { bcrypt = require('bcrypt'); }
catch(e) { bcrypt = require('bcryptjs'); }
const nopt = require("nopt");
const path = require("path");
const fs = require("fs-extra");
const RED = require("nodde-red");

var server;
var app = express();

var settings;
var settingsFile;
var flowFile;

var knownOpts = {
    "help": Boolean,
    "port": Number,
    "settings": [path],
    "title": String,
    "userDir": [path],
    "verbose": Boolean
};
var shortHands = {
    "?":["--help"],
    "p":["--port"],
    "s":["--settings"],
    // As we want to reserve -t for now, adding a shorthand to help so it
    // doesn't get treated as --title
    "t":["--help"],
    "u":["--userDir"],
    "v":["--verbose"]
};
nopt.invalidHandler = function(k,v,t) {
    // TODO: console.log(k,v,t);
}

function init() {

    var parsedArgs = nopt(knownOpts,shortHands,process.argv,2)

    if (parsedArgs.help) {
        console.log("Node-RED v"+RED.version());
        console.log("Usage: node-red [-v] [-?] [--settings settings.js] [--userDir DIR]");
        console.log("                [--port PORT] [--title TITLE] [flows.json]");
        console.log("");
        console.log("Options:");
        console.log("  -p, --port     PORT  port to listen on");
        console.log("  -s, --settings FILE  use specified settings file");
        console.log("      --title    TITLE process window title");
        console.log("  -u, --userDir  DIR   use specified user directory");
        console.log("  -v, --verbose        enable verbose output");
        console.log("  -?, --help           show this help");
        console.log("");
        console.log("Documentation can be found at http://nodered.org");
        return false;
    }

    if (parsedArgs.argv.remain.length > 0) {
        flowFile = parsedArgs.argv.remain[0];
    }

    if (parsedArgs.settings) {
        // User-specified settings file
        settingsFile = parsedArgs.settings;
    } else if (parsedArgs.userDir && fs.existsSync(path.join(parsedArgs.userDir,"settings.js"))) {
        // User-specified userDir that contains a settings.js
        settingsFile = path.join(parsedArgs.userDir,"settings.js");
    } else {
        if (fs.existsSync(path.join(process.env.NODE_RED_HOME,".config.json"))) {
            // NODE_RED_HOME contains user data - use its settings.js
            settingsFile = path.join(process.env.NODE_RED_HOME,"settings.js");
        } else {
            var userDir = parsedArgs.userDir || path.join(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE,".node-red");
            var userSettingsFile = path.join(userDir,"settings.js");
            if (fs.existsSync(userSettingsFile)) {
                // $HOME/.node-red/settings.js exists
                settingsFile = userSettingsFile;
            } else {
                var defaultSettings = path.join(__dirname,"settings.js");
                var settingsStat = fs.statSync(defaultSettings);
                if (settingsStat.mtime.getTime() <= settingsStat.ctime.getTime()) {
                    // Default settings file has not been modified - safe to copy
                    fs.copySync(defaultSettings,userSettingsFile);
                    settingsFile = userSettingsFile;
                } else {
                    // Use default settings.js as it has been modified
                    settingsFile = defaultSettings;
                }
            }
        }
    }

    try {
        settings = require(settingsFile);
        settings.settingsFile = settingsFile;
    } catch(err) {
        console.log("Error loading settings file: "+settingsFile)
        if (err.code == 'MODULE_NOT_FOUND') {
            if (err.toString().indexOf(settingsFile) === -1) {
                console.log(err.toString());
            }
        } else {
            console.log(err);
        }
        return false;
    }

    if (parsedArgs.verbose) {
        settings.verbose = true;
    }

    server = http.createServer(function(req,res) {app(req,res);});
    server.setMaxListeners(0);

    function formatRoot(root) {
        if (root[0] != "/") {
            root = "/" + root;
        }
        if (root.slice(-1) != "/") {
            root = root + "/";
        }
        return root;
    }

    settings.httpAdminRoot = '/';
    settings.disableEditor = false;
    delete settings.httpAdminAuth;

    if (settings.httpNodeRoot !== false) {
        settings.httpNodeRoot = formatRoot(settings.httpNodeRoot || settings.httpRoot || "/");
        settings.httpNodeAuth = settings.httpNodeAuth || settings.httpAuth;
    }

    settings.uiPort = parsedArgs.port||settings.uiPort||0;
    settings.uiHost = settings.uiHost||"127.0.0.1";

    if (flowFile) {
        settings.flowFile = flowFile;
    }
    if (parsedArgs.userDir) {
        settings.userDir = parsedArgs.userDir;
    }

    try {
        RED.init(server,settings);
    } catch(err) {
        if (err.code == "unsupported_version") {
            console.log("Unsupported version of node.js:",process.version);
            console.log("Node-RED requires node.js v4 or later");
        } else if  (err.code == "not_built") {
            console.log("Node-RED has not been built. See README.md for details");
        } else {
            console.log("Failed to start server:");
            if (err.stack) {
                console.log(err.stack);
            } else {
                console.log(err);
            }
        }
        return false;
    }

    app.use(settings.httpAdminRoot,RED.httpAdmin);
    
    if (settings.httpNodeRoot !== false) {
        app.use(settings.httpNodeRoot,RED.httpNode);
    }

    if (settings.httpStatic) {
        app.use("/",express.static(settings.httpStatic));
    }

    return true;
}

function start(cb) {

    if(typeof cb !== 'function') {
        throw new Error('Callback function must be supplied');
    }

    function getListenPath(port) {
        return url.format({
            protocol: 'http:',
            hostname: settings.uiHost == '0.0.0.0'?'127.0.0.1':settings.uiHost,
            port: port,
            pathname: settings.httpAdminRoot || '/'

        });
    }

    RED.start().then(function() {
        server.on('error', function(err) {
            if (err.errno === "EADDRINUSE") {
                RED.log.error(RED.log._("server.unable-to-listen", {listenpath:getListenPath(settings.uiPort)}));
                RED.log.error(RED.log._("server.port-in-use"));
            } else {
                RED.log.error(RED.log._("server.uncaught-exception"));
                if (err.stack) {
                    RED.log.error(err.stack);
                } else {
                    RED.log.error(err);
                }
            }
            cb(err, null);
        });
        server.listen(settings.uiPort,settings.uiHost,function() {
            process.title = parsedArgs.title || 'node-red';

            let listenPath = getListenPath(server.address().port);
            RED.log.info(RED.log._("server.now-running", {listenpath:listenPath}));
            
            cb(null, listenPath);
        });
    }).otherwise(function(err) {
        RED.log.error(RED.log._("server.failed-to-start"));
        if (err.stack) {
            RED.log.error(err.stack);
        } else {
            RED.log.error(err);
        }
        cb(err, null)
    });
}

module.exports = {
    init,
    start,
    RED
}