/**
 * 字体下载与生成脚本
 *
 * 使用方式:
 *   node download-fonts.js              # 默认: 实例化 NotoSansSC-VF.ttf 生成静态字体
 *   node download-fonts.js --from-cdn   # 从 @expo-google-fonts CDN 下载静态字体
 *   node download-fonts.js --vf <path>  # 从指定 VF 文件生成
 *
 * pdf-lib 不支持 Variable Font (含 fvar/gvar 表), 必须先实例化成静态 TTF
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const fontDir = path.join(__dirname, 'public', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });

const args = process.argv.slice(2);
const useCdn = args.includes('--from-cdn');
const vfIndex = args.indexOf('--vf');
const vfPath = vfIndex >= 0 ? args[vfIndex + 1] : null;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function attempt(targetUrl, redirects = 0) {
      https.get(targetUrl, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && redirects < 5) {
          attempt(response.headers.location, redirects + 1);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    }
    attempt(url);
  });
}

async function downloadVF() {
  // 从 Google Fonts 仓库下载 NotoSansSC-VF.ttf
  const tmpFile = path.join(__dirname, '..', 'NotoSansSC-VF.ttf');
  const url = 'https://github.com/notofonts/noto-cjk/raw/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf';
  console.log(`Downloading VF from: ${url}`);
  await downloadFile(url, tmpFile);
  const size = fs.statSync(tmpFile).size / 1024 / 1024;
  console.log(`  Downloaded: ${size.toFixed(1)} MB -> ${tmpFile}`);
  return tmpFile;
}

function instantiateVF(vf) {
  // 使用 fonttools (Python) 实例化字重 400 (Regular) 和 700 (Bold)
  const py = `
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import sys, os

src = ${JSON.stringify(vf)}
out_dir = ${JSON.stringify(fontDir)}

for wght, ps_name, subfamily, full_name in [
    (400, 'NotoSansSC-Regular', 'Regular', 'Noto Sans SC'),
    (700, 'NotoSansSC-Bold', 'Bold', 'Noto Sans SC Bold'),
]:
    font = TTFont(src)
    inst = instantiateVariableFont(font, {'wght': wght})
    out_path = os.path.join(out_dir, f'{ps_name}.ttf')

    # 修正 name 表 (避免 pdf-lib 识别为 Thin)
    nt = inst['name']
    for nid in (1, 2, 4, 6, 16, 17):
        nt.removeNames(nameID=nid)
    nt.setName('Noto Sans SC', 1, 3, 1, 0x0409)
    nt.setName(subfamily, 2, 3, 1, 0x0409)
    nt.setName(full_name, 4, 3, 1, 0x0409)
    nt.setName(ps_name, 6, 3, 1, 0x0409)
    nt.setName('Noto Sans SC', 16, 3, 1, 0x0409)
    nt.setName(subfamily, 17, 3, 1, 0x0409)
    nt.setName('Noto Sans SC', 1, 1, 0, 0)
    nt.setName(subfamily, 2, 1, 0, 0)
    nt.setName(full_name, 4, 1, 0, 0)
    nt.setName(ps_name, 6, 1, 0, 0)

    inst.save(out_path)
    print(f'  Saved: {out_path} ({os.path.getsize(out_path):,} bytes, name={ps_name})')
`;
  const scriptPath = path.join(__dirname, '.tmp_instantiate.py');
  fs.writeFileSync(scriptPath, py);
  try {
    execSync(`python "${scriptPath}"`, { stdio: 'inherit' });
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function downloadFromCdn() {
  // 从 @expo-google-fonts 下载 (这些是 static TTF, 但部分版本可能也是 VF, 需要确认)
  const fonts = [
    { name: 'NotoSansSC-Regular.ttf', url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.2.3/NotoSansSC_400Regular.ttf' },
    { name: 'NotoSansSC-Bold.ttf', url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.2.3/NotoSansSC_700Bold.ttf' },
  ];
  for (const font of fonts) {
    const dest = path.join(fontDir, font.name);
    console.log(`Downloading ${font.name}...`);
    await downloadFile(font.url, dest);
    const size = fs.statSync(dest).size / 1024 / 1024;
    console.log(`  ${size.toFixed(1)} MB`);
  }
}

async function main() {
  if (useCdn) {
    console.log('=== Download from CDN ===');
    await downloadFromCdn();
  } else {
    let vf = vfPath;
    if (!vf) {
      vf = path.join(__dirname, '..', 'NotoSansSC-VF.ttf');
    }
    if (!fs.existsSync(vf)) {
      console.log(`VF not found at ${vf}, downloading...`);
      vf = await downloadVF();
    } else {
      console.log(`Using existing VF: ${vf}`);
    }
    console.log('=== Instantiate Variable Font to static TTF ===');
    instantiateVF(vf);
  }
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
