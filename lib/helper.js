var fs = require('fs');
var path = require('path');

function insure(dir_path) {
  if (insure._[dir_path] || fs.existsSync(dir_path)) {
    return true;
  }

  dir_path.split(/[\/\\]/).reduce(function(prefix, current) {
    prefix += current + '/';
    var fullpath = path.resolve(prefix);
    if (!fs.existsSync(fullpath)) {
      try {
        fs.mkdirSync(fullpath);
      } catch (e) {
        throw new Error('Opps... failed to create ' + fullpath + ' directory');
      }
    }
    return prefix;
  }, '');

  insure._[dir_path] = true;
}
insure._ = {};

module.exports.insure = insure;
