'use strict';

const assert = require('chai').assert;
const DiffMatchPatch = require('diff-match-patch');
const express = require('express');

const delta = require('../');

const diff = new DiffMatchPatch;

describe('delta', function(){
  it("constructor should return valid middleware", function() {
    let app = express();
    app.get('/dynamicContent', delta('some response'));
  });
});
