'use strict';
const http = require('http');
const nodeCreateDeltaCache = require('delta-cache');

function createDeltaCache() {

  const deltaCache = nodeCreateDeltaCache();

  // return middleware
  return function(req, res, next) {
    const buffers = [];

    const _write = res.write;
    const _end = res.end;

    // override
    res.write = function write(chunk, encoding, callback) {
      buffers.push(Buffer.from(chunk, encoding));

      if (callback) {
        // although method is sync, callback is needed to maintain consistent interface
        callback()
      }
    }

    // override
    res.end = function end(data, encoding, callback) {
      if (data) {
        // no need to give callback since overridden method is sync
        res.write(data, encoding)
      }

      const finalBuffer = Buffer.concat(buffers);
      // override end and write back to default so the response can end properly
      res.end = _end.bind(this)
      res.write = _write.bind(this)
      deltaCache.respondWithDeltaEncoding(req, res, finalBuffer, callback);
    }

    next();
  }
}

module.exports = createDeltaCache;
