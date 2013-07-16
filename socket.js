var socket = require('socket.io');

exports.listen = function(server) {
  var io = socket.listen(server);
  io.set('log level', 1);
  io.sockets.on('connection', function(socket) {
  });
};
