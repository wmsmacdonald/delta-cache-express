'use strict';

const http = require('http');
const fs = require('fs');
const url = require('url');

const assert = require('chai').assert;
const express = require('express');
const vcd = require('vcdiff');

const createDeltaCache = require('../');

const DEFAULT_REQUEST_OPTIONS = {
  host: 'localhost',
  port: 6767,
  path: '/dynamicContent'
};

describe('DeltaCache', function(){
  it("single request on app level middleware should return normal response", function(done) {
    const deltaCache = createDeltaCache();
    const app = express();
    app.use(DEFAULT_REQUEST_OPTIONS.path, deltaCache);
    app.get(DEFAULT_REQUEST_OPTIONS.path, (req, res) => {
      res.write('some response,');
      res.end('more stuff');
    });

    const server = app.listen(DEFAULT_REQUEST_OPTIONS.port, () => {
      GET(DEFAULT_REQUEST_OPTIONS).then(({ data, response }) => {
        assert.strictEqual(data.toString(), 'some response,more stuff');
        server.close(done);
      }).catch(done);
    })

  });

  it("single request on router level middleware should return normal response", function(done) {
    const deltaCache = createDeltaCache();
    const app = express();
    app.get(DEFAULT_REQUEST_OPTIONS.path, deltaCache);
    app.get(DEFAULT_REQUEST_OPTIONS.path, (req, res) => {
      res.write('some response,');
      res.end('more stuff');
    });

    const server = app.listen(DEFAULT_REQUEST_OPTIONS.port, () => {
      GET(DEFAULT_REQUEST_OPTIONS).then(({ data, response }) => {
        assert.strictEqual(data.toString(), 'some response,more stuff');
        server.close(done);
      }).catch(done);
    })
  });

  it("second request should return normal response", function(done) {
    const deltaCache = createDeltaCache();
    const app = express();
    app.get(DEFAULT_REQUEST_OPTIONS.path, deltaCache);

    const version1 = 'some text 1';
    const version2 = 'some text 2';
    let first = true;

    app.get(DEFAULT_REQUEST_OPTIONS.path, (req, res) => {
      if (first) {
        res.end(version1);
        first = false;
      }
      else {
        res.end(version2);
      }
    });

    const server = app.listen(DEFAULT_REQUEST_OPTIONS.port, () => {
      GET(DEFAULT_REQUEST_OPTIONS).then(({ data: data1, response: response1 }) => {
        assert.strictEqual(data1.toString(), version1);
        
        const etag = response1.headers['etag']

        const requestOptions = DEFAULT_REQUEST_OPTIONS
        requestOptions.headers = {
          'If-None-Match': etag,
          'A-IM': 'vcdiff'
        }

        return GET(requestOptions).then(({ data: data2, response: response2 }) => {
          assert.isDefined(response2.headers['etag']);
          assert.strictEqual(response2.statusCode, 226);
          assert.strictEqual(response2.statusMessage, 'IM Used');
          assert.strictEqual(response2.headers['im'], 'vcdiff');
          const target = vcd.vcdiffDecodeSync(data2, { dictionary: data1 });
          // ensure the patched version is the same as the one on the server
          assert.strictEqual(target.toString(), version2);

          server.close(done);
        })
      }).catch(done);
    })
  });
    
});

/**
 * Gets resource via http
 * @param options       options for http.request
 * @returns {Promise{data: Buffer, response: ServerResponse}}} 
 */
function GET(options) {
  return new Promise((resolve, reject) => {
    let req = http.get(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        req.end();
        resolve({ data, response: res });
      });
    });
    req.on('error', reject);
  });
}

