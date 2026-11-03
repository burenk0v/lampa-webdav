'use strict';

var fs = require('node:fs');
var path = require('node:path');

var root = path.resolve(__dirname, '..');
var outputDir = path.join(root, 'dist');
var outputFile = path.join(outputDir, 'lampa-webdav.js');
var sources = [
    'src/webdav.js',
    'src/client.js',
    'src/plugin.js'
];

fs.mkdirSync(outputDir, { recursive: true });
var bundle = sources.map(function (file) {
    return fs.readFileSync(path.join(root, file), 'utf8').replace(/\s+$/, '');
}).join('\n\n') + '\n';
fs.writeFileSync(outputFile, bundle, 'utf8');
process.stdout.write('Built ' + path.relative(root, outputFile) + '\n');
