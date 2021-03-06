#!/usr/bin/env node

var fs            = require('fs')
  , path          = require('path')
  , util          = require('util')
  , Script        = process.binding('evals').Script
  , coffee        = require('coffee-script')
  , Module        = require('module')
  , node_versions = require('../lib/lib').node_versions
  , c             = process.binding('crypto').Connection
  , crypto        = require('crypto')
  , creds         = crypto.createCredentials()
  ;



var config = JSON.parse(fs.readFileSync(path.join('.nodester', 'config.json'), encoding = 'utf8'));
// Read the package.json
var packageJSON = {};
// asuming that here we are already chrooted, so the app path is '/'
var appdir = fs.readdirSync('/');
if (appdir.indexOf('package.json') !== -1 ) {
  try {
    packageJSON = JSON.parse(fs.readFileSync(path.join('/','package.json'),'utf8'));
  } catch(exp) {
    packageJSON = {
     node:process.version
    }
  }
} 
// RUN status (true/false)

config.userid = parseInt(config.userid);

console.log(config);

//These 3 lines ensure that we get the daemon setup by the nodester user and not the
// one available to root, since we are sudoed at this point
require.paths.unshift(path.join(config.appdir, '../', 'node_modules'));
require.paths.unshift(path.join(config.appdir, '../', '.node_libraries'));
require.paths.unshift('/node_modules');
require.paths.unshift('/.node_libraries');

var daemon = require('daemon');


var app_port = parseInt(config.port);
var app_host = config.ip;

console.log('chroot: ', config.apphome);
daemon.chroot(config.apphome);
require.paths.unshift('/node_modules');
console.log('Starting Daemon');
daemon.daemonize(path.join('.nodester', 'logs', 'daemon.log'), path.join('.nodester', 'pids', 'app.pid'), function (err, pid) {
  var error_log_fd = fs.openSync('/error.log', 'w');
  var log = function (obj) {
      console.log(arguments);
      fs.write(error_log_fd, arguments[0] + '\n');
    };
  if (err) {
    log(err.stack);
  }
  log('Inside Daemon: ' + pid);
  log('Changing to user: ' + config.userid);
  try {
    daemon.setreuid(config.userid);
    log('User Changed: ' + process.getuid());
  } catch (e) {
    log('User Change FAILED');
  }

  process.on('uncaughtException', function (err) {
    fs.write(error_log_fd, err.stack);
  });

  var etc = path.join('/', 'etc');
  //create /etc inside the chroot
  log('Checking for /etc');
  if (!path.existsSync(etc)) {
    log('/etc does not exist. Creating..');
    fs.mkdirSync(etc, 0777);
  }
  log('Update /etc/resolve.conf with Googles DNS servers..');
  fs.writeFileSync(path.join(etc, 'resolv.conf'), 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n', encoding = 'utf8');

  log('Setting up sandbox..');
  //Setup the main sandbox..
  var sandbox = {
    global: {},
    process: process,
    require: require,
    console: console,
    module: {},
    __filename: config.start,
    __dirname: "/",
    clearInterval: clearInterval,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    setTimeout: setTimeout
  };

  sandbox.module = new Module();
  sandbox.module.id = '.';
  sandbox.module.filename = '/' + config.start;
  sandbox.module.paths = ['/'];

  sandbox.process.pid = pid;
  sandbox.process.installPrefix = '/';
  // Run a specified node version using the `n` module from TJ, if no version is
  // found, set default to node v0.4.9, `n` can handle 0.4.9 as v0.4.9
  var version = sandbox.module["node"] = packageJSON["node"];
  version = version.replace('v','').trim()
  // Simple check for the version requested by the user and the availables
  var RUN = (node_versions().indexOf(version) !== -1);
  if (!RUN){
    version = process.version.replace('v','');
  }
  sandbox.process.ARGV = ['n use ' + version, config.start];
  sandbox.process.argv = sandbox.process.ARGV;
  var env = sandbox.process.env = sandbox.process.ENV = {
    // defaults which can be overriden
    NODE_ENV: "production"
  };

  if (config.env) {
    Object.keys(config.env).forEach(function (key) {
      env[key] = String(config.env[key]);
    });
  }

  // environment variables which cannot be overriden by config.
  env.app_port = app_port;
  env.app_host = app_host;
  env.port = app_port;
  env.host = app_host;
  env.PORT = app_port;
  env.HOST = app_host;
  sandbox.process.title = app_host;
  sandbox.process.mainModule = sandbox.module;
  sandbox.process.kill = function () {
    return 'process.kill is disabled'
  };
  sandbox.process.stdout.write = sandbox.console.warn = sandbox.console.error = function (args) {
    fs.write(error_log_fd, args.toString());
  };

  console.log('Munging require paths..');

  var _require = require;
  var _resolve = require.resolve;
  //this should make require('./lib/foo'); work properly
  sandbox.require = function (f) {
    sandbox.require.paths.forEach(function (v, k) {
      if (v.indexOf('./') === 0) {
        sandbox.require.paths[k] = v.substring(1);
      }
    });
    if (f.indexOf('./') === 0) {
      try {
        _require.call(_require, f);
      } catch (e) {
        f = f.substring(1);
      }
    }
    //This is to support require.paths.push('./lib'); require('foo.js');
    try {
      _require.call(_require, f);
    } catch (e) {
      var m;
      sandbox.require.paths.forEach(function (v, k) {
        if (m) {
          return;
        }
        try {
          m = _require.call(_require, path.join(v, f));
          f = path.join(v, f);
        } catch (e) {}
      });
    }

    /**
     * Simple HTTP sandbox to make sure that http listens on the assigned port.
     * May also need to handle the net module too..
     * THIS IS A HACK, this "sandboxing" will fail if a user "require"'s a module in a submodule.
     */
    var createServer = function () {
        var h = _create.apply(this, arguments);
        var _listen = h.listen;
        h.listen = function (port) {
          port = parseInt(port, 10);
          if (!RUN) console.log('[WARN] You asked for node-v'+version+' but it\'s not avaiable, running as '+process.version);
          if (port !== app_port) {
            console.log('[ERROR] You asked to listen on port', port, 'but nodester will use port', app_port, 'instead..');
          } else {
            console.log('[INFO] Nodester running node ' + version);
            console.log('[INFO] Nodester listening on port:', app_port);
          }
          _listen.call(h, app_port);
        };
        return h;
      };
    var m = _require.call(_require, f);
    if (m.createServer) { //Too aggressive??
      var _create = m.createServer;
      m.createServer = createServer;
    }
    return m;
  };
  for (var i in _require) {
    sandbox.require[i] = _require[i];
  }
  sandbox.require.resolve = function (f) {
    if (f.indexOf('./') === 0) {
      //console.log('Nodester fixing require path', f);
      f = f.substring(1);
      //console.log('Nodester fixed require path', f);
    }
    return _resolve.call(this, f);
  };


  sandbox.require.main = sandbox.module;
  sandbox.require.cache = {};
  sandbox.require.cache['/' + config.start] = sandbox.module;
  sandbox.require.paths = ['/node_modules', '/.node_libraries'];

  sandbox.process.on('uncaughtException', function (err) {
    fs.write(error_log_fd, util.inspect(err));
  });

  console.log('Globalizing Buffer');
  sandbox.Buffer = Buffer;

  console.log('Reading file...');
  console.log(config.start + ' owned by ' + config.userid);
  var isCoffee = (path.extname(config.start) === '.coffee');
  fs.readFile(config.start, function (err, script_src) {
    try {
      var resp = daemon.setreuid(config.userid);
      console.log('Final user check: ', process.getuid());
    } catch (e2) {
      console.log('Final User Change Failed.');
      console.log(resp);
    }
    if (err) {
      console.log(util.inspect(err));
      process.exit(1);
    } else {
      console.log('Nodester wrapped script starting (PID: ' + process.pid + ') at ', new Date());
      if (isCoffee){
        console.log('Compiling coffee-script');
        script_src = coffee.compile("require('coffee-script');\r\n" + script_src);
      }
      Script.runInNewContext(script_src, sandbox, config.start);
    }
  });
  //End Daemon
});