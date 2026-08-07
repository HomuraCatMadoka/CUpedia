# macOS Zip Chinese Filename Encoding

## Problem

Zip files created on Windows with Chinese filenames use CP437 encoding for the filename metadata. macOS's built-in `unzip` cannot decode this — it produces "Illegal byte sequence" errors and fails to extract files with Chinese characters.

## Symptoms

```
$ unzip 管理人尽调材料.zip
checkdir error:  cannot create 管�??人尽�?�??�??(1)/+����=����
                 Illegal byte sequence
error:  cannot create 管�??人尽�?�??�??(1)/ˬ��ͦii������+�+˩æ�i-��.pdf
        Illegal byte sequence
```

## Fix: Use Python's zipfile Module

```python
import zipfile, os

def decode_name(raw):
    """Try UTF-8 first (zip created on modern systems), fall back to GBK."""
    try:
        return raw.encode('cp437').decode('utf-8')
    except:
        try:
            return raw.encode('cp437').decode('gbk')
        except:
            return raw  # give up, keep garbled name

def extract_with_unicode(zip_path, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            name = decode_name(info.filename)
            target = os.path.join(dest_dir, name)
            if name.endswith('/'):
                os.makedirs(target, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with z.open(info.filename) as src, open(target, 'wb') as dst:
                    dst.write(src.read())
```

## Verification

After extraction, check that filenames are readable Chinese:

```bash
ls -la "$dest_dir" | head -10
```

Should show proper Chinese characters like `2025年审计报告.pdf`, not garbled replacement characters.

## Why This Happens

- Windows zip: uses CP437 (DOS codepage) for non-ASCII filenames
- macOS/Linux zip: uses UTF-8
- macOS `unzip`: assumes system encoding (UTF-8), can't decode CP437
- Python's `zipfile.ZipFile.infolist()`: preserves raw bytes; Python lets you re-encode

## Alternative Approaches (that don't work reliably)

| Approach | Result |
|----------|--------|
| `unzip -O cp437` | Requires `unzip` 6.0+ with patch — macOS ships 5.52 without `-O` |
| `ditto -x -k` | macOS native tool, also fails on CP437 |
| `unar` / `The Unarchiver` | May work if installed via brew, but inconsistent |

Python zipfile with explicit `.encode('cp437').decode('utf-8')` is the most reliable approach.
