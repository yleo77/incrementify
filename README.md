## incrementify

Generate increment file with two versions of a file base on old version.

## Usage 

### With Command Line

```
incrementify [options] oldfile newfile
```
Supported options:

* -c chunkSize: set chunkSize (default: 12)
* -o filename: use [output-file] as output instead of STDOUT

### API

```javascript
var incrementify = require("incrementify").build;
var ret = incrementify(file_with_old_version, file_with_new_version);
console.log(JSON.stringify(ret));
```

Also support config

```javascript
var ret = incrementify(arg1, arg2, {
  oldfile_type: 'content',   // default: 'path' 
  newfile_type: 'path',      // default: 'path' 
  chunkSize: 12,             //default size
  output: 'filename'         // make sure you have write permission to this file
});
```

### Resources

* [MT - 手机腾讯网](http://mt.tencent.com/)
* [用增量更新算法为 web 应用节省流量](http://www.ibm.com/developerworks/cn/web/1401_luyf_reducejs/) by [luyongfugx](https://github.com/luyongfugx)

## License

The MIT License (MIT)

### Copyright (c) 2014 Tencent MT Team
