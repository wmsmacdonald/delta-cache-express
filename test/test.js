'use strict';

const https = require('https');
const fs = require('fs');
const url = require('url');
const util = require('util');

const assert = require('chai').assert;
const DiffMatchPatch = require('diff-match-patch');
const express = require('express');

const delta = require('../');

const diff = new DiffMatchPatch;

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

  describe("client request has matching etag in If-None-Match header", function() {
    it("should get a 224 response with working delta", function(done) {
      let app = express();
      let version1 = 'sample test 1';
      let version2 = 'sample test 2';
      let first = true;
      app.get(DEFAULT_REQUEST_OPTIONS.path, (req, res, next) => {
        if (first) {
          res.locals.responseBody = version1;
          first = false;
        }
        else {
          res.locals.responseBody = version2;
        }
        next();
      }, delta);

      let cache;
      let server = https.createServer(EXPRESS_OPTIONS, app).listen(DEFAULT_REQUEST_OPTIONS.port, () => {
        // first request (nothing cached)
        GET(util._extend(DEFAULT_REQUEST_OPTIONS, {
          headers: {
            'A-IM': 'googlediffjson'
          }
        })).then(({ data, response }) => {
          cache = data;
          assert.strictEqual(data, version1);
          assert.isDefined(response.headers['etag']);
          assert.notStrictEqual(response.headers['IM'], 'googlediffjson');
          return GET(util._extend(DEFAULT_REQUEST_OPTIONS, {
            headers: {
              'A-IM': 'googlediffjson',
              'If-None-Match': response.headers['etag']
            }
          }));
        // second request (version1 cached)
        }).then(({ data, response }) => {
          assert.isDefined(response.headers['etag']);
          assert.strictEqual(response.statusCode, 226);
          assert.strictEqual(response.headers['im'], 'googlediffjson');

          let patches = JSON.parse(data);
          let patchedVersion = diff.patch_apply(patches, cache)[0];
          // ensure the patched version is the same as the one on the server
          assert.strictEqual(patchedVersion, version2);
          server.close(done);
        }).catch(error => {
          throw new Error(error);
        })
      });
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