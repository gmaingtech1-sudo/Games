# vendor

`three.min.js` is [three.js](https://threejs.org) r186 (`three@0.186.1` from npm), bundled into one minified script that exposes a global `THREE`:

```sh
npm i three@0.186.1 esbuild
echo "export * from 'three';" > entry.js
npx esbuild entry.js --bundle --format=iife --global-name=THREE --minify --legal-comments=eof --target=es2019 --outfile=three.min.js
```

three.js is MIT licensed, © 2010-2026 three.js authors. The licence notice is at the end of the file.
