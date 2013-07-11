exports.index = function(req, res) {
  res.render('index');
};

exports.lobby = function(req, res) {
  res.render('lobby');
};

exports.room = function(req, res) {
  res.render('room', {'roomid': req.params.id});
};
