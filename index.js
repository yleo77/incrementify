// @copyright Tencent MT Team

var fs = require('fs');
var crypto = require('crypto');
var chunkSize = 12;

/**
 * 根据旧文件和新文件差异，生成基于旧文件的增量内容
 *
 * @public
 *
 * @param {string} oldpath 旧文件路径 required
 * @param {string} newpath 新文件路径 required
 * @param {object} config  可选配置
 *
 * @return {object}
 *   status: {boolean} 是否生成,false 为对应文件不存在时生成失败。
 *   signal: {number}  任务执行结果.
 *     1 **旧**版本文件不存在
 *     2 **新**版本文件不存在
 *     3 当需要写入文件时，写入失败
 *     10 增量文件内容获取成功, (需要写入文件时同时写入成功)
 *   code: {string}当 signal 为 true 时 则为生成的增量内容，否则为失败原因
 */
exports.build = function(oldfilepath, newfilepath, config, callback) {

  var ret = {
    status: false,
    signal: -1,
    code: ''
  };

  if (!oldfilepath || !fs.existsSync(oldfilepath)) {
    ret.signal = 1;
    ret.code = '目标文件 ' + oldfilepath + ' 不存在, 不需要生成增量文件';
  } else if (!newfilepath || !fs.existsSync(newfilepath)) {
    ret.signal = 2;
    ret.code = '目标文件新版本 ' + newfilepath + ' 不存在, 请检查配置';
  } else {

    if (arguments.length === 3 && typeof config === 'function') {
      callback = config;
      config = {};
    }

    if (config.chunkSize) {
      chunkSize = config.chunkSize;
    }

    ret.code = JSON.stringify(makeIncDataFile(oldfilepath, newfilepath));
    if (config.output) {
      try {
        fs.writeFileSync(config.output, ret.code);
        set();
      } catch (e) {
        ret.code = e.code + ', 写入失败, 请检查是否有权限写入';
        ret.signal = 3;
      }
    } else {
      set();
    }
  }

  return ret;

  function set() {
    ret.signal = 10;
    ret.status = true;
  }
};

function makeIncDataFile(oldFile, newFile) {

  var oldFileContent = fs.readFileSync(oldFile, {
    encoding: 'utf8'
  });
  var newFileContent = fs.readFileSync(newFile, {
    encoding: 'utf8'
  });

  var resultFile = {
    modify: true,
    chunkSize: chunkSize
  };
  var strDataArray = [];

  //计算新旧两个文件，如果相同则说明文件没有改动,则直接返回空数组
  if (getMd5(oldFileContent) == getMd5(fs.readFileSync(newFile))) {
    resultFile.modify = false;
    resultFile.data = strDataArray;
    return resultFile;
  }

  var oldChecksum = oldFileChecksum(oldFileContent, chunkSize);
  var diffArray = searchChunk(newFile, oldChecksum, chunkSize);
  var arrayData = "";
  var lastitem = null;
  var matchCount = 0;
  var size = diffArray.length;

  for (var i = 0; i < size; i++) {

    var item = diffArray[i];
    if (item.isMatch) {
      //如果第一个匹配，
      if (lastitem == null || !lastitem.isMatch) {
        arrayData = "[" + item.data + ",";
        matchCount = 1;
      } else if (lastitem.isMatch && lastitem.data + 1 == item.data) {
        matchCount++;
      } else if (lastitem.isMatch && (lastitem.data + 1) != item.data) {
        arrayData += matchCount + "]";
        strDataArray.push(JSON.parse(arrayData));
        arrayData = "[" + item.data + ",";
        matchCount = 1;
      }
      if (i == (size - 1)) {
        arrayData += matchCount + "]";
        strDataArray.push(JSON.parse(arrayData));
        arrayData = "";
      }
    } else {
      if (matchCount > 0) {
        arrayData += matchCount + "]";
        strDataArray.push(JSON.parse(arrayData));
        arrayData = "";
        matchCount = 0;
      }
      //&quot;
      var data = item.data;
      strDataArray.push(data);
    }
    lastitem = item;
  }
  resultFile.data = strDataArray;
  return resultFile;
}

function diffItem(m, dt) {
  this.isMatch = m;
  this.data = dt;
}

function doExactNewData(incDataArray, data) {
  var di = new diffItem(false, data);
  incDataArray.push(di);
}

function doExactMatch(incDataArray, chunkNo) {
  // 写块匹配
  var di = new diffItem(true, chunkNo);
  incDataArray.push(di);
}

function searchChunk(newFile, checksumArray, chunkSize) {

  var incDataArray = [];
  //chunk
  var buffer = null;
  //用于缓存两个匹配块之间的新增数据
  var outBuffer = "";
  // 指向块后的第一个字符
  var currentIndex = 0;
  var strInput = fs.readFileSync(newFile, {
    encoding: 'utf8'
  });
  var tLen = strInput.length;
  var lastmatchNo = 0;
  while (currentIndex <= tLen) {
    var endIndex = currentIndex + chunkSize;
    if (endIndex > tLen) {
      endIndex = tLen;
    }
    buffer = strInput.substring(currentIndex, endIndex);
    var chunkMd5 = getMd5(buffer);

    var matchTrunkIndex = checkMatchIndex(chunkMd5, checksumArray, lastmatchNo);
    //若果是最后一个
    if (endIndex > tLen - 1) {
      //先把新块压入队列
      if (outBuffer.length > 0) {
        doExactNewData(incDataArray, outBuffer);
        outBuffer = "";
      }
      if (buffer.length > 0) {
        doExactNewData(incDataArray, buffer);
      }
      currentIndex = currentIndex + chunkSize;
    }
    //如果找到匹配块
    else if (matchTrunkIndex >= 0) {
      //先把新块压入队列
      if (outBuffer.length > 0) {
        doExactNewData(incDataArray, outBuffer);
        outBuffer = "";
      }
      doExactMatch(incDataArray, matchTrunkIndex);
      currentIndex = currentIndex + chunkSize;

    } else {
      outBuffer = outBuffer + strInput.substring(currentIndex, currentIndex + 1);
      currentIndex++;
    }
    if (matchTrunkIndex >= 0) {
      lastmatchNo = matchTrunkIndex;
    }

  }
  return incDataArray;
}

function oldFileChecksum(fileC, chunkSize) {
  var txt = fileC;
  var checksumArray = {}; // object
  var currentIndex = 0;
  var len = txt.length;
  var chunkNo = 0;
  while (currentIndex < len) {
    var chunk = txt.substr(currentIndex, chunkSize);
    var chunkMd5 = getMd5(chunk);
    //用map来解决冲突,
    var numArray = checksumArray[chunkMd5];
    //如果没有过一个一样的
    if (typeof(numArray) == 'undefined') {
      numArray = [];
    }

    numArray.push(chunkNo);
    checksumArray[chunkMd5] = numArray;

    currentIndex = currentIndex + chunkSize;
    chunkNo++;
  }

  return checksumArray;
}

function getMatchNo(numArray, lastmatchNo) {
  if (numArray.length == 1) {
    return numArray[0];
  } else {

    var lastNo = numArray[0];
    var reNo = 0;
    for (var i = 0; i < numArray.length; i++) {
      var curNo = numArray[i];

      if (curNo >= lastmatchNo && lastNo <= lastmatchNo) {
        return (lastmatchNo - lastNo) >= (curNo - lastmatchNo) ? curNo : lastNo;
      } else if (curNo >= lastmatchNo && lastNo >= lastmatchNo) {
        return lastNo;
      } else if (curNo <= lastmatchNo && lastNo <= lastmatchNo) {
        reNo = curNo;
      } else {
        reNo = curNo;
      }
      lastNo = curNo;
    }
    return reNo;
  }
}

function checkMatchIndex(chunkMd5, checksumArray, lastmatchNo) {
  var numArray = checksumArray[chunkMd5];

  if (typeof(numArray) == 'undefined') {
    return -1;
  } else {
    return getMatchNo(numArray, lastmatchNo);
  }
}

function getMd5(c) {
  // var s = c;
  // var md5sum = crypto.createHash('md5');
  // md5sum.update(s);
  // return md5sum.digest('hex');

  return crypto.createHash('md5').update(c).digest('hex');
}