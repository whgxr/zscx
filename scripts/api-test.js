
const http = require('http');
http.get('http://localhost:3000/api/auth/third-party/platforms', function(res){
  var d = '';
  res.on('data', function(c){ d += c; });
  res.on('end', function(){ console.log('HTTP ' + res.statusCode + ': ' + d); });
}).on('error', function(e){ console.error('Error:', e.message); });
