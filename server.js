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
      console.log(data);
      if ( underscore.contains(connected_users, data.user.username) ) {
        accept(null, false);
      } else {
        accept(null, true);
      }
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


// --- user module configurations
var LocalStrategy = require('passport-local').Strategy;
passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username, password: password }, function (err, user) {
      if ( err ) { return done(err); }
      if ( !user ) {
        return done(null, false, {message: 'Invalid username/password!'});
      }
      if ( underscore.contains(connected_users, username) ) {
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
    res.redirect('/game');
  }
});
app.get('/game', function(req, res) {
  if ( req.isAuthenticated() ) {
    res.render('game', {'username': req.user.username});
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

var connected_clients = [];
var connected_users = [];
io.sockets.on('connection', function(client) {
  var username = client.handshake.user.username;
  console.log("user connected: ", username);
  connected_clients.push(client);
  connected_users.push(username);

  client.on('disconnect', function() {
    connected_clients.splice(connected_clients.indexOf(client), 1);
    connected_users.splice(connected_users.indexOf(username), 1);
    console.log("user disconnected: ", username);
    io.sockets.emit('user update', username+" disconnected.");
  });
  client.on('message', function(data) {
    client.broadcast.send(data);
  });
  client.on('join lobby', function(username) {
    console.log("user joined lobby: ", username);
    io.sockets.emit('user update', username+" joined lobby.");
  });
  client.on('get user list', function() {
    send_user_list(client);
  });
  send_room_list(client);
});

var send_user_list = function(socket) {
  async.map(connected_clients, function(client, callback) {
    User.findById(client.handshake.user.id, function(err, user) {
      var user_info = [];
      user_info.push(user.username);
      user_info.push(user.score);
      user_info.push(client.manager.roomClients[client.id]);
      callback(null, user_info);
    });
  },
  function(err, user_list) {
    socket.emit('user list', user_list);
  });
};

var send_room_list = function(socket) {
  socket.emit('room list', io.sockets.manager.rooms);
};


// --------------------------------------------------------------- //
//
// Gobang Online fire up!
//
// --------------------------------------------------------------- //
server.listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
