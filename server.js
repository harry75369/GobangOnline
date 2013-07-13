var express = require('express')    // Web Framework
  , http = require('http')          // HTTP Server
  , socket = require('socket.io')   // WebSocket Server
  , passport = require('passport')  // User Module
  , mongoose = require('mongoose')  // Database Module
  , path = require('path');         // System Utility


// --------------------------------------------------------------- //
//
// Gobang Online configurations
//
// --------------------------------------------------------------- //
var app = express();
app.configure(function() {
  app.set('port', 8888);
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.set('wwwroot', path.join(__dirname, 'public'));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('oh it\'s a secret'));
  app.use(express.session());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use('/', express.static(app.get('wwwroot')));
  app.use('/room', express.static(app.get('wwwroot')));
});
app.configure('development', function() {
  app.use(express.errorHandler());
});

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

var LocalStrategy = require('passport-local').Strategy;
passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username, password: password }, function (err, user) {
      done(err, user);
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
    res.render('index');
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
app.get('/room/:id', function(req, res) {
  if ( req.isAuthenticated() ) {
    res.render('room', {'roomid': req.params.id,
                        'username': req.user.username });
  } else {
    res.redirect('/');
  }
});
app.get('/logout', function(req, res) {
  if ( req.isAuthenticated() ) { req.logOut(); }
  res.redirect('/');
});
// TODO: failure flash
app.post('/', passport.authenticate('local', { failureRedirect: '/',
                                               successRedirect: '/lobby' }));
app.use(function(req, res, next) {
  res.status(404);
  res.sendfile(path.join(app.get('wwwroot'), '404.html'));
});


// --------------------------------------------------------------- //
//
// Gobang Online fire up!
//
// --------------------------------------------------------------- //
var server = http.createServer(app);
socket.listen(server);
server.listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
