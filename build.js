const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, 'renderer', 'app.js')],
  bundle: true,
  outfile: path.join(__dirname, 'dist', 'bundle.js'),
  platform: 'browser',
  format: 'iife',
  minify: false,
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).then(() => {
  console.log('Build complete: dist/bundle.js');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
