var express = require('express')
  , path = require('path')
  , http = require('http')
  , socket = require('socket.io')
  , passport = require('passport')
  , routes = require('./routes');

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
  app.use(app.router);
  app.use('/', express.static(app.get('wwwroot')));
  app.use('/room', express.static(app.get('wwwroot')));
});

app.configure('development', function() {
  app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/lobby', routes.lobby);
app.get('/room/:id', routes.room);

app.use(function(req, res, next) {
  res.status(404);
  res.sendfile(path.join(app.get('wwwroot'), '404.html'));
});

http.createServer(app).listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
socket.listen(app);
