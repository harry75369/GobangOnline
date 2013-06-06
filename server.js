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

http.createServer(app).listen(app.get('port'), function() {
  console.log('Gobang Online Server is running on port ' + app.get('port'));
});
socket.listen(app);
