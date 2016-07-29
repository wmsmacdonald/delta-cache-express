'use strict';
const TextHistory = require('text-history');

let resourceHistories = {};

// middleware for express
function delta(req, res, next) {

  // if there isn't a resource history yet
  if (resourceHistories[req.route.path] === undefined) {
    resourceHistories[req.route.path] = TextHistory();
  }
  let id = resourceHistories[req.route.path].addVersion(res.locals.responseBody);

  res.header('ETag', `"${id}"`);

  let matchingEtag = req.headers['if-none-match'] === undefined
    ? undefined
    : firstMatchingEtag(req.headers['if-none-match'], resourceHistories[req.route.path]);

  let isDeltaCompatible;
  if (req.headers['a-im'] === undefined) {
    isDeltaCompatible = false;
  }
  else {
    // checks header for delta compatibility
    isDeltaCompatible = req.headers['a-im'].split(', ').indexOf('googlediffjson') !== -1;
  }

  // if etag wasn't in the header or there wasn't any matching etag
  if (matchingEtag === undefined || !isDeltaCompatible) {
    return res.end(resourceHistories[req.route.path].lastVersion);
  }
  // client has a cached version of the page
  else {
    let patches = resourceHistories[req.route.path].getPatches(matchingEtag);

    // if the versions are the same
    if (patches.length === 0) {
      res.status(304).send();
    }
    else {
      res.header('IM', 'googlediffjson');
      res.header('Delta-Base', `"${matchingEtag}"`);
      res.status(226).json(patches);
    }
  }
  next();
}

function firstMatchingEtag(etagsHeader, resourceHistory) {
  let etags = etagsHeader.split(', ');
  // remove quotes from etag
  let etagsWithoutQuotes = etags.map(etag => etag.replace( /^"|"$/g, '' ));
  // gets etag that exists in the resource history
  return etagsWithoutQuotes.find(etag => resourceHistory.hasVersion(etag));
}

module.exports = delta;