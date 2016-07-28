'use strict';

const https = require('https');
const fs = require('fs');
const diff_match_patch = require('./diff_match_patch');
const diff = new diff_match_patch.diff_match_patch();

let cache;

function getDynamicFile() {
  let options = {
    host: 'localhost',
    port: 8000,
    path: '/dynamic.html'
  };

  if (cache !== undefined) {
    options.headers = {
      'Delta-Version': cache.version
    }
  }

  let req = https.get(options, (res) => {

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      req.end();
      if (res.headers['delta-version'] !== undefined) {
        if (res.headers['delta-patch'] === 'true') {
          console.log(data);
          data = diff.patch_apply(JSON.parse(data), cache.data)[0];
        }
        cache = {
          version: res.headers['delta-version'],
          data: data
        };
      }
    });
  });
}

setInterval(getDynamicFile, 3000);



