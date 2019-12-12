// Helpers
exports.require = function (filePath) {
  delete require.cache[path.join(path.dirname(require.main.filename), filePath)];
  return require(path.join(path.dirname(require.main.filename), filePath))(this);
};

exports.getFileContents = function (filePath) {
  try {
    return fs.readFileSync(path.join(path.dirname(require.main.filename), filePath), 'utf-8');
  } catch (err) {
    return '';
  }
};

exports.getFileArray = function (srcPath) {
  try {
    srcPath = path.join(path.dirname(require.main.filename), srcPath);
    return fs.readdirSync(srcPath).filter(file => fs.statSync(path.join(srcPath, file)).isFile());
  } catch (err) {
    return [];
  }
};

exports.getJsonObject = function (filePath) {
  return JSON.parse(exports.getFileContents(filePath));
};

exports.resolveMention = function (usertxt) {
  let userid = usertxt;
  if (usertxt.startsWith('<@!')) {
    userid = usertxt.substr(3, usertxt.length - 4);
  } else if (usertxt.startsWith('<@')) {
    userid = usertxt.substr(2, usertxt.length - 3);
  }
  return userid;
};
