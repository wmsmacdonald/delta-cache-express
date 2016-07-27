'use strict';
const TextHistory = require('text-history');

function delta(body) {
  let resourceHistories = {};

  return function(req, res, next) {
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
      next();
    }
  }
}

module.exports = delta;