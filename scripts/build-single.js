// Bundles index.html, styles.css and src/*.js into one self-contained dist/pu5.html.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}</style>`);
html = html.replace(/<script src="(src\/[\w.]+)"><\/script>/g, (_, f) => `<script>\n${read(f)}</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'pu5.html'), html);
console.log('Wrote dist/pu5.html');
