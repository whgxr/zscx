import urllib.request
import os
import json

font_dir = r"D:\开发征收项目\zscx\web\public\fonts"
os.makedirs(font_dir, exist_ok=True)

# 尝试多个字体源
font_options = [
    # Google Fonts API - Noto Sans SC
    {
        "url": "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap",
        "type": "css",
    },
]

# 直接从已知的CDN下载
font_urls = [
    # jsDelivr - notosans-sc
    ("https://cdn.jsdelivr.net/gh/notofonts/noto-cn@gh-pages/NotoSansSC/NotoSansSC-Regular.otf", "NotoSansSC-Regular.otf"),
    ("https://cdn.jsdelivr.net/gh/notofonts/noto-cn@gh-pages/NotoSansSC/NotoSansSC-Bold.otf", "NotoSansSC-Bold.otf"),
]

for url, filename in font_urls:
    filepath = os.path.join(font_dir, filename)
    if not os.path.exists(filepath):
        print(f"Downloading {filename}...")
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            with urllib.request.urlopen(req, timeout=30) as response:
                with open(filepath, 'wb') as f:
                    f.write(response.read())
            size = os.path.getsize(filepath) / 1024 / 1024
            print(f"  Downloaded: {size:.1f} MB")
        except Exception as e:
            print(f"  Failed: {e}")
    else:
        size = os.path.getsize(filepath) / 1024 / 1024
        print(f"{filename} already exists ({size:.1f} MB)")

print("\nDone!")
