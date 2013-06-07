var express = require('express')
  , path = require('path')
  , http = require('http')
  , socket = require('socket.io');

var app = express();

app.configure(function() {
  app.set('port', 8888);
  app.set('wwwroot', path.join(__dirname, 'public'));
  app.use(express.logger('dev'));
  app.use(express.static(app.get('wwwroot')));
});

app.use(app.router);
app.use(function(req, res, next) {
  res.status(404);
  res.sendfile(path.join(app.get('wwwroot'), '404.html'));
});

http.createServer(app).listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
socket.listen(app);
