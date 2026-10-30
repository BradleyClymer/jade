const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

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
  // Copy KaTeX CSS and fonts to dist/ for packaging
  const katexDist = path.join(__dirname, 'node_modules', 'katex', 'dist');
  fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(__dirname, 'dist', 'katex.min.css'));
  const fontsDir = path.join(__dirname, 'dist', 'fonts');
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(katexDist, 'fonts'))) {
    if (f.endsWith('.woff2')) {
      fs.copyFileSync(path.join(katexDist, 'fonts', f), path.join(fontsDir, f));
    }
  }
  console.log('Build complete: dist/bundle.js + KaTeX assets');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
