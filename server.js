var express = require('express')                     // Web Framework
  , http = require('http')                           // HTTP Server
  , flash = require('connect-flash')                 // Flash Message Module
  , passport = require('passport')                   // User Module
  , socket = require('socket.io')                    // WebSocket Server
  , passport_socketio = require('passport.socketio') // User Module for WebSocket
  , mongoose = require('mongoose')                   // Database Module
  , underscore = require('underscore')               // Javascript Utility
  , async = require('async')                         // Async-programming Utility
  , assert = require('assert')                       // Test Utility
  , path = require('path');                          // System Utility


// ------------------------------------------------------------------------- //
//
// Gobang Online configurations
//
// ------------------------------------------------------------------------- //
var app = express();                              // instantiate an express app
var server = http.createServer(app);              // create an HTTP server
var io = socket.listen(server);                   // bind web socket to HTTP server
var memstore = new express.session.MemoryStore(); // session store method

// --- express app configurations
app.configure(function() {
  app.set('port', 8888);
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.set('wwwroot', path.join(__dirname, 'public'));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('oh it\'s a secret'));
  app.use(express.session({
    store: memstore,
    key: 'express.sid',
    secret: 'oh it\'s a secret'
  }));
  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use('/', express.static(app.get('wwwroot')));
  app.use('/room', express.static(app.get('wwwroot')));
});
app.configure('development', function() {
  app.use(express.errorHandler());
});

// --- web socket configurations
io.configure(function() {
  io.set('log level', 1);
  io.set('authorization', passport_socketio.authorize({
    cookieParser: express.cookieParser,
    key:          'express.sid',
    secret:       'oh it\'s a secret',
    store:        memstore,
    fail:         function(data, accept) {
      accept(null, false);
    },
    success:      function(data, accept) {
      // TODO: manager.isXXX...
      accept(null, true);
    }
  }));
});

// --- database configurations
mongoose.connect('mongodb://localhost/gobang-online');
mongoose.connection.on('error', function(err) { if (err) throw new Error(err); });
mongoose.connection.on('open', function() {
  console.log('Database connected successfully!');
});
var User = mongoose.model('User', new mongoose.Schema({
  username: String,
  password: String,
  score: Number
}));
User.update({username: 'admin'}, {password: 'admin', score: 0}, {multi:false, upsert:true},
            function (err) { if (err) throw new Error(err); })
User.update({username: 'bdahz'}, {password: 'bdahzz', score: 2}, {multi:false, upsert:true},
            function (err) { if (err) throw new Error(err); })
User.update({username: 'test'}, {password: 'test', score: 1}, {multi:false, upsert:true},
            function (err) { if (err) throw new Error(err); })
User.update({username: 'test1'}, {password: 'test1', score: 1}, {multi:false, upsert:true},
            function (err) { if (err) throw new Error(err); })
User.update({username: 'test2'}, {password: 'test2', score: 1}, {multi:false, upsert:true},
            function (err) { if (err) throw new Error(err); })
User.update({username: 'test3'}, {password: 'test3', score: 1}, {multi:false, upsert:true},
            function (err) { if (err) throw new Error(err); })


// --- user module configurations
var LocalStrategy = require('passport-local').Strategy;
passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username, password: password }, function (err, user) {
      if ( err ) { return done(err); }
      if ( !user ) {
        return done(null, false, {message: 'Invalid username/password!'});
      }
      if ( manager.isUserSignedIn(username) ) {
        return done(null, false, {message: 'User already signed in!'});
      }
      return done(null, user);
    });
  }
));
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});


// --------------------------------------------------------------- //
//
// Gobang Online logics
//
// --------------------------------------------------------------- //
app.get('/', function(req, res) {
  if ( req.isUnauthenticated() ) {
    res.render('index', {'message': req.flash('error')});
  } else {
    res.redirect('/lobby');
  }
});
app.get('/lobby', function(req, res) {
  if ( req.isAuthenticated() ) {
    res.render('lobby', {'username': req.user.username});
  } else {
    res.redirect('/');
  }
});
app.get('/room/:name', function(req, res) {
  if ( req.isAuthenticated() ) {
    res.render('room', {'username': req.user.username, 'roomname': req.params.name});
  } else {
    res.redirect('/');
  }
});
app.get('/logout', function(req, res) {
  if ( req.isAuthenticated() ) { req.logOut(); }
  res.redirect('/');
});
app.post('/', function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if ( err ) { return next(err); }
    if ( !user ) {
      req.flash('error', info.message);
      return res.redirect('/');
    }
    req.logIn(user, function(err) {
      if ( err ) { return next(err); }
      return res.redirect('/');
    });
  })(req, res, next);
});
app.use(function(req, res, next) {
  res.status(404);
  res.sendfile(path.join(app.get('wwwroot'), '404.html'));
});

var UserManager = function(server_socket) {
  this.server_socket = server_socket;
  this.users = {};
  this.rooms = {};
};
var Room = function(name) {
  this.name = name;
  this.status = 'waiting';
  this.player1 = '';
  this.player2 = '';
  this.time1 = 0;
  this.time2 = 0;
  this.observers = [];
};
Room.prototype.addUser = function(username) {
  var observers = this.observers;
  // if this room is holding a game, add user to observers
  if ( !(underscore.isEqual(this.status, "waiting")) ) {
    assert(this.player1&&this.player2, "null players!");
    observers.push(username);
  }
  else { // if not, try to make the user a player (if not occupied)
    if ( underscore.isEmpty(this.player1) ) {
      this.player1 = username;
    } else if ( underscore.isEmpty(this.player2) ) {
      this.player2 = username;
    } else {
      observers.push(username);
    }
  }
};
Room.prototype.delUser = function(username) {
  var observers = this.observers;
  if ( underscore.contains(observers, username) ) {
    observers.splice(observers.indexOf(username), 1);
  }
  else {
    if ( underscore.isEqual(username, this.player1) ) {
      this.player1 = '';
    } else if ( underscore.isEqual(username, this.player2) ) {
      this.player2 = '';
    }
    if ( !(underscore.isEqual(this.status, "waiting")) ) {
      // TODO:
    }
  }
};
Room.prototype.isPlayer = function(username) {
  if ( underscore.isEqual(username, this.player1)
    || underscore.isEqual(username, this.player2) ) {
      return true;
  }
  return false;
};
UserManager.prototype.connectUser = function(user_socket) {
  var users = this.users;
  var rooms = this.rooms;
  var server_socket = this.server_socket;

  // preprocessing
  var username = user_socket.handshake.user.username;
  var url = user_socket.handshake.headers.referer;
  var reg = /\/room\/([^ \/]+)[\/]?$/;
  var roomname = '';
  if ( reg.test(url) ) {
    roomname = url.match(reg)[1];
  }
  var msgs = [];

  // set up data structures
  if ( users[username] ) {
    users[username].push(roomname);
  } else {
    users[username] = [roomname];
  }
  if ( !(underscore.isEmpty(roomname)) ) {
    if ( !rooms[roomname] ) rooms[roomname] = new Room(roomname);
    rooms[roomname].addUser(username);
  }
  console.log(users);
  console.log(rooms);

  // messages
  console.log("user connected:", username);
  console.log("user joined room:", username, roomname);
  if ( !(underscore.isEmpty(roomname)) ) {
    user_socket.join(roomname);
    msgs.push(username+" joined room "+roomname+".");
  } else {
    msgs.push(username+" joined lobby.");
  }

  // emit signals
  server_socket.emit('user update', msgs);
  server_socket.emit('room update');
  if ( !(underscore.isEmpty(roomname)) ) {
    server_socket.in(roomname).emit('user update in room', msgs);
  }
};
UserManager.prototype.disconnectUser = function(user_socket) {
  var users = this.users;
  var rooms = this.rooms;
  var server_socket = this.server_socket;

  // preprocessing
  var username = user_socket.handshake.user.username;
  var url = user_socket.handshake.headers.referer;
  var reg = /\/room\/([^ \/]+)[\/]?$/;
  var roomname = '';
  if ( reg.test(url) ) {
    roomname = url.match(reg)[1];
  }
  var msgs = [];

  // deal with data structures
  if ( users[username] ) {
    users[username].splice(users[username].indexOf(roomname), 1);
  }
  if ( !(underscore.isEmpty(roomname)) ) {
    if ( rooms[roomname] ) {
      rooms[roomname].delUser(username);
    }
  }
  console.log(users);
  console.log(rooms);

  // messages
  console.log("user disconnected:", username);
  if ( !(underscore.isEmpty(roomname)) ) {
    console.log("user left room:", username, roomname);
    msgs.push(username+" left room "+roomname+".");
  } else {
    console.log("user left lobby:", username);
    msgs.push(username+" left lobby.");
  }

  // emit signals
  server_socket.emit('user update', msgs);
  server_socket.emit('room update');
  if ( !(underscore.isEmpty(roomname)) ) {
    server_socket.in(roomname).emit('user update in room', msgs);
  }
};
UserManager.prototype.isUserSignedIn = function(username) {
  var users = this.users;
  return ( users[username] && !(underscore.isEmpty(users[username])) );
};
UserManager.prototype.sendUserList = function(user_socket) {
  var users = this.users;
  var usernames = Object.keys(users);
  async.map(usernames, function(username, callback) {
    User.findOne({username:username}, function(err, user) {
      if ( err ) return callback(err);
      var user_info = [];
      user_info.push(user.username);
      user_info.push(user.score);
      user_info.push(users[username]);
      callback(null, user_info);
    });
  },
  function(err, user_list) {
    if ( !err ) {
      user_socket.emit('user list', user_list);
    } else {
      user_socket.emit('user list', "error getting user list");
    }
  });
};
UserManager.prototype.sendRoomList = function(user_socket) {
  user_socket.emit('room list', this.rooms);
};
UserManager.prototype.sendUserListInRoom = function(room, user_socket) {
  var users = this.users;
  var rooms = this.rooms;
  var usernames = Object.keys(users);
  async.filter(usernames, function(username, callback) {
    if ( underscore.contains(users[username], room) ) {
      callback(true);
    } else {
      callback(false);
    }
  },
  function(results) {
    async.map(results, function(username, callback) {
      User.findOne({username:username}, function(err, user) {
        if ( err ) return callback(err);
        var user_info = [];
        user_info.push(user.username);
        user_info.push(user.score);
        user_info.push(rooms[room].isPlayer(username));
        callback(null, user_info);
      });
    },
    function(err, user_list) {
      if ( !err ) {
        user_socket.emit('user list in room', user_list);
      } else {
        user_socket.emit('user list in room', "error getting user list");
      }
    });
  });
};
UserManager.prototype.sendRoomInfo = function(room, user_socket) {
  user_socket.emit('room info', this.rooms[room]);
};
var manager = new UserManager(io.sockets);
io.sockets.on('connection', function(client) {
  manager.connectUser(client);

  client.on('disconnect', function() {
    manager.disconnectUser(client);
  });
  client.on('public message', function(data) {
    client.broadcast.emit('public message', data);
  });
  client.on('private message', function(room, data) {
    client.broadcast.to(room).emit('private message', data);
  });
  client.on('get user list', function() {
    manager.sendUserList(client);
  });
  client.on('get room list', function() {
    manager.sendRoomList(client);
  });
  client.on('get user list in room', function(room) {
    manager.sendUserListInRoom(room, client);
  });
  client.on('get room info', function(room) {
    manager.sendRoomInfo(room, client);
  });
});


// --------------------------------------------------------------- //
//
// Gobang Online fire up!
//
// --------------------------------------------------------------- //
server.listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
