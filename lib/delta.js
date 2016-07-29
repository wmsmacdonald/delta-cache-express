'use strict';
const TextHistory = require('text-history');

function DeltaCache() {

  let resourceHistories = {};

  // return middleware
  return function(req, res, next) {
    // if there isn't a resource history yet
    if (resourceHistories[req.route.path] === undefined) {
      resourceHistories[req.route.path] = TextHistory();
    }
    let id = resourceHistories[req.route.path].addVersion(res.locals.responseBody);

    res.header('ETag', `"${id}"`);

    let matchingEtag = req.headers['if-none-match'] === undefined
      ? undefined
      : firstMatchingEtag(req.headers['if-none-match'], resourceHistories[req.route.path]);

    // if etag wasn't in the header or there wasn't any matching etag
    if (matchingEtag === undefined) {
      // send response with normal 200
      res.send(resourceHistories[req.route.path].lastVersion);
    }
    // client has a cached version
    else {
      let patches = resourceHistories[req.route.path].getPatches(matchingEtag);

      // content hasn't changed
      if (patches.length === 0) {
        res.status(304).send();
      }
      // has necessary headers for delta caching
      else if (isDeltaCompatible(req.headers)) {
        // send delta
        res.header('IM', 'googlediffjson');
        res.header('Delta-Base', `"${matchingEtag}"`);
        res.status(226).json(patches);
      }
      else {
        // send response with normal 200
        res.send(resourceHistories[req.route.path].lastVersion);
      }
    }
    next();
  }
}

function firstMatchingEtag(etagsHeader, resourceHistory) {
  let etags = etagsHeader.split(', ');
  // remove quotes from etag
  let etagsWithoutQuotes = etags.map(etag => etag.replace( /^"|"$/g, '' ));
  // gets etag that exists in the resource history
  return etagsWithoutQuotes.find(etag => resourceHistory.hasVersion(etag));
}

function isDeltaCompatible(headers) {
  if (headers['a-im'] === undefined) {
    return false;
  }
  else {
    // checks header for delta compatibility
    return headers['a-im'].split(', ').indexOf('googlediffjson') !== -1;
  }
}

module.exports = DeltaCache;