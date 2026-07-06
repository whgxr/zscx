const https = require('https');
const fs = require('fs');
const path = require('path');

const fontDir = path.join(__dirname, 'public', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });

const fonts = [
  {
    name: 'NotoSansSC-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.2.3/NotoSansSC_400Regular.ttf'
  },
  {
    name: 'NotoSansSC-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.2.3/NotoSansSC_700Bold.ttf'
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  for (const font of fonts) {
    const dest = path.join(fontDir, font.name);
    if (fs.existsSync(dest)) {
      console.log(`${font.name} already exists`);
      continue;
    }
    console.log(`Downloading ${font.name}...`);
    try {
      await downloadFile(font.url, dest);
      const size = fs.statSync(dest).size / 1024 / 1024;
      console.log(`  Done: ${size.toFixed(1)} MB`);
    } catch (err) {
      console.log(`  Failed: ${err.message}`);
    }
  }
  console.log('Done!');
}

main();
