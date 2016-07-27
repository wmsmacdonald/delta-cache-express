'use strict';

const express = require('express');
const fs = require('fs');
const https = require('https');
const pug = require('pug');
const uuid = require('node-uuid');
const md5 = require('md5');
const TextHistory = require('text-history');

//const testFile = fs.readFileSync('./test_files/test1.txt');

let resourceHistories = {};

let options = {
  key: fs.readFileSync('/home/bill/.ssh/key.pem'),
  cert: fs.readFileSync('/home/bill/.ssh/cert.pem')
};

let app = express();
app.set('view engine', 'pug');
app.use(express.static('test/public'));

app.set('etag', 'strong'); // use strong etags

app.get('/dynamic.html', function (req, res) {
  let date = new Date().toString();
  let responseBody = '<h1>' + date + '</h1>';

  // if there isn't a resource history yet
  if (resourceHistories[req.route.path] === undefined) {
    resourceHistories[req.route.path] = TextHistory(md5);
  }

  let id = resourceHistories[req.route.path].addVersion(responseBody);

  res.header('ETag', `"${id}"`);

  let matchingEtag = req.headers['if-none-match'] === undefined
    ? undefined
    : firstMatchingEtag(req.headers['if-none-match'], resourceHistories[req.route.path]);

  // if etag wasn't in the header or there wasn't any matching etag
  if (matchingEtag === undefined) {
    return res.end(resourceHistories[req.route.path].lastVersion);
  }
  // client has a cached version of the page
  else {
    let patches = resourceHistories[req.route.path].getPatches(matchingEtag);

    res.header('IM', 'json');
    res.header('Delta-Base', `"${matchingEtag}"`);
    console.log(JSON.stringify(patches));
    res.status(226).json(patches);
  }
});

function firstMatchingEtag(etagsHeader, resourceHistory) {
  let etags = etagsHeader.split(', ');
  // remove quotes from etag
  let etagsWithoutQuotes = etags.map(etag => etag.replace( /^"|"$/g, '' ));
  // gets etag that exists in the resource history
  return etagsWithoutQuotes.find(etag => resourceHistory.hasVersion(etag));
}

https.createServer(options, app).listen(8000);
