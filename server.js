var express = require('express')                     // Web Framework
  , http = require('http')                           // HTTP Server
  , flash = require('connect-flash')                 // Flash Message Module
  , passport = require('passport')                   // User Module
  , socket = require('socket.io')                    // WebSocket Server
  , passport_socketio = require('passport.socketio') // User Module for WebSocket
  , mongoose = require('mongoose')                   // Database Module
  , underscore = require('underscore')               // Javascript Utility
  , async = require('async')                         // Async-programming Utility
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
  this.connected_users = [];
  this.user_rooms = {};
};
UserManager.prototype.connectUser = function(user_socket) {
  // preprocessing
  var username = user_socket.handshake.user.username;
  var url = user_socket.handshake.headers.referer;
  var reg = /\/room\/([^ \/]+)[\/]?$/;
  var room = '';
  if ( reg.test(url) ) {
    room = url.match(reg)[1];
  }

  var msgs = [];

  // deal with username
  if ( !(underscore.contains(this.connected_users, username)) ) {
    this.connected_users.push(username);
    console.log("user connected:", username, room);
  }
  // deal with room
  if ( !(underscore.isEmpty(room)) ) {
    if ( this.user_rooms[username] ) {
      if ( !(underscore.contains(this.user_rooms[username], room)) ) {
        this.user_rooms[username].push(room);
        var msg = username+" joined room "+room+".";
        console.log("user joined room:", username, "->", room, this.user_rooms[username]);
        msgs.push(msg);
      }
    } else {
      this.user_rooms[username] = [room];
    }
    user_socket.join(room);
  } else {
    var msg = username+" joined lobby.";
    this.user_rooms[username] = [];
    console.log("user joined lobby:", username, this.user_rooms[username]);
    msgs.push(msg);
  }
  return msgs;
};
UserManager.prototype.disconnectUser = function(user_socket) {
  // preprocessing
  var username = user_socket.handshake.user.username;
  var url = user_socket.handshake.headers.referer;
  var reg = /\/room\/([^ \/]+)[\/]?$/;
  var room = '';
  if ( reg.test(url) ) {
    room = url.match(reg)[1];
  }

  var msgs = [];

  if ( !(underscore.isEmpty(room)) ) {
    if ( this.user_rooms[username] && underscore.contains(this.user_rooms[username], room) ) {
      this.user_rooms[username].splice(this.user_rooms[username].indexOf(room), 1);
      var msg = username+" left room "+room+".";
      console.log("user left room:", username, "<-", room, this.user_rooms[username]);
      msgs.push(msg);
    }
  } else {
    var msg = username+" left lobby.";
    console.log("user left lobby:", username, this.user_rooms[username]);
    msgs.push(msg);
    if ( !(this.user_rooms[username]) || underscore.isEmpty(this.user_rooms[username]) ) {
      if ( underscore.contains(this.connected_users, username) ) {
        this.connected_users.splice(this.connected_users.indexOf(username), 1);
      }
    }
  }
  console.log("user disconnected:", username, room);
  return msgs;
};
UserManager.prototype.isUserSignedIn = function(username) {
  if ( underscore.contains(this.connected_users, username) ) {
    return true;
  } else {
    return false;
  }
};
UserManager.prototype.sendUserList = function(user_socket) {
  var user_rooms = this.user_rooms;
  async.map(this.connected_users, function(username, callback) {
    User.findOne({username:username}, function(err, user) {
      if ( err ) callback(err);
      var user_info = [];
      user_info.push(user.username);
      user_info.push(user.score);
      user_info.push(user_rooms[username]);
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
  user_socket.emit('room list', this.server_socket.manager.rooms);
};
var manager = new UserManager(io.sockets);
io.sockets.on('connection', function(client) {
  io.sockets.emit('user update', manager.connectUser(client));
  io.sockets.emit('room update');

  client.on('disconnect', function() {
    io.sockets.emit('user update', manager.disconnectUser(client));
    io.sockets.emit('room update');
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
});


// --------------------------------------------------------------- //
//
// Gobang Online fire up!
//
// --------------------------------------------------------------- //
server.listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
