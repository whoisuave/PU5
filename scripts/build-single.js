// Bundles index.html, styles.css and src/*.js into one self-contained dist/pu5.html.
// With --artifact, writes dist/pu5-artifact.html without the <html>/<head>/<body>
// wrapper, for hosts that add their own document skeleton.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}</style>`);
html = html.replace(/<script src="(src\/[\w.]+)"><\/script>/g, (_, f) => `<script>\n${read(f)}</script>`);

let out = 'pu5.html';
if (process.argv.includes('--artifact')) {
  out = 'pu5-artifact.html';
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?(html|head|body)[^>]*>\s*/g, '')
    .replace(/\s*<meta (charset|name="viewport")[^>]*>/g, '');
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', out), html);
console.log(`Wrote dist/${out}`);
