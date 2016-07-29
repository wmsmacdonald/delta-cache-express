'use strict';

const https = require('https');
const fs = require('fs');
const url = require('url');
const util = require('util');

const assert = require('chai').assert;
const DiffMatchPatch = require('diff-match-patch');
const express = require('express');

const delta = require('../');

const diff = new DiffMatchPatch();

const EXPRESS_OPTIONS = {
  key: fs.readFileSync('/home/bill/.ssh/key.pem'),
  cert: fs.readFileSync('/home/bill/.ssh/cert.pem')
};

const DEFAULT_REQUEST_OPTIONS = {
  host: 'localhost',
  port: 6767,
  path: '/dynamicContent'
};

describe('delta', function(){
  it("should return valid middleware", function() {
    let app = express();
    app.get(DEFAULT_REQUEST_OPTIONS.path, (res, req) => {
      req.locals.responseBody = 'some response';
    }, delta);
  });

  describe("client request doesn't have A-IM header", function() {
    it("should get full response with etag", function (done) {
      let app = express();
      let text = 'some response';
      app.get(DEFAULT_REQUEST_OPTIONS.path, (res, req, next) => {
        req.locals.responseBody = text;
        next();
      }, delta);

      let server = https.createServer(EXPRESS_OPTIONS, app).listen(DEFAULT_REQUEST_OPTIONS.port, () => {
        GET(DEFAULT_REQUEST_OPTIONS).then(({ data, response }) => {
          assert.strictEqual(data, text);
          // etag should always be given
          assert.isDefined(response.headers['etag']);
          server.close(done);
        }).catch(error => {
          throw new Error(error);
        });
      });
    });
  });

  describe("client request has matching etag in If-None-Match header and content has changed", function() {
    it("should get a 226 response with working delta", function(done) {
      let version1 = 'body 1';
      let version2 = 'body 2';

      let cache;
      simulateServerAndRequests([version1, version2], [(data, res) => {
        cache = data;

        assert.strictEqual(data, version1);
        assert.isDefined(res.headers['etag']);
        assert.notStrictEqual(res.headers['IM'], 'googlediffjson');

      }, (data, res) => {
        assert.isDefined(res.headers['etag']);
        assert.strictEqual(res.statusCode, 226);
        assert.strictEqual(res.headers['im'], 'googlediffjson');
        let patches = JSON.parse(data);
        let patchedVersion = diff.patch_apply(patches, cache)[0];
        // ensure the patched version is the same as the one on the server
        assert.strictEqual(patchedVersion, version2);
      }]).then(done).catch(done);
    });
  });
  describe("client request has matching etag in If-None-Match header but content hasn't changed", function() {
    it("should get a 304 response without a response body", function(done) {
      let text = 'some text';

      simulateServerAndRequests([text, text], [(data, res) => {

        assert.strictEqual(data, text);
        assert.isDefined(res.headers['etag']);
        assert.notStrictEqual(res.headers['IM'], 'googlediffjson');

      }, (data, res) => {
        assert.isDefined(res.headers['etag']);
        assert.strictEqual(res.statusCode, 304);
        assert.notStrictEqual(res.headers['im'], 'googlediffjson');
        assert.strictEqual(data, '');
      }]).then(done).catch(done);
    });
  });

  describe("client request has non-matching etag in If-None-Match header", function() {
    it("should get full response", function(done) {
      let app = express();
      let text = 'some response';
      app.get(DEFAULT_REQUEST_OPTIONS.path, (res, req, next) => {
        req.locals.responseBody = text;
        next();
      }, delta);
      let server = https.createServer(EXPRESS_OPTIONS, app).listen(DEFAULT_REQUEST_OPTIONS.port, () => {
        GET(util._extend(DEFAULT_REQUEST_OPTIONS, {
          headers: {
            'A-IM': 'googlediffjson',
            'If-None-Match': '"unmatchable_etag"'
          }
        })).then(({ data, response }) => {
          assert.strictEqual(data, text);
          assert.isDefined(response.headers['etag']);
          assert.notStrictEqual(response.headers['IM'], 'googlediffjson');
          server.close(done);
        }).catch(error => {
          throw new Error(error);
        })
      });
    });
  });

});

/**
 * Gets resource via https
 * @param options       options for http.request
 * @returns {Promise}
 * @constructor
 */
function GET(options) {
  return new Promise((resolve, reject) => {
    let req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        req.end();
        resolve({ data, response: res });
      });
    });
    req.on('error', reject);
  });
}

function simulateServerAndRequests(responseBodies, callbacks) {
  let app = express();

  let responseNum = 0;
  app.get(DEFAULT_REQUEST_OPTIONS.path, (req, res, next) => {
    res.locals.responseBody = responseBodies[responseNum++];
    next();
  }, delta);
  return new Promise((resolve, reject) => {
    let server = https.createServer(EXPRESS_OPTIONS, app).listen(DEFAULT_REQUEST_OPTIONS.port, () => {

      simulateRequests(DEFAULT_REQUEST_OPTIONS, undefined, callbacks).then(() => {
        server.close(err => {
          if (err) {
            reject(err);
          }
          else {
            resolve();
          }
        });
      }).catch(reject);
    });
  })
}

function simulateRequests(requestOptions, etag, callbacks) {
  return new Promise((resolve, reject) => {
    if (callbacks.length > 0) {
      request(requestOptions, etag).then(({ data, response }) => {
        callbacks[0](data, response);
        return simulateRequests(requestOptions, response.headers['etag'], callbacks.splice(1));
      }).then(resolve).catch(reject);
    }
    else {
      resolve();
    }
  });
}

function request(requestOptions, etag) {
  let options = util._extend(requestOptions, {
    headers: {
      'A-IM': 'googlediffjson'
    }
  });
  if (etag !== undefined) {
    options.headers['If-None-Match'] = etag;
  }
  return GET(options);
}