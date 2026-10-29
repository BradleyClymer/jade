// Quick script to convert SVG to a usable PNG icon
// For now, Electron can use the SVG directly via nativeImage
const fs = require('fs');
const path = require('path');

// Just verify the SVG exists
const svgPath = path.join(__dirname, 'icon.svg');
if (fs.existsSync(svgPath)) {
  console.log('Icon SVG ready at:', svgPath);
} else {
  console.error('icon.svg not found');
}
