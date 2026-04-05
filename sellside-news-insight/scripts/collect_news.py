#!/usr/bin/env python3
import subprocess
from pathlib import Path
from datetime import datetime
import re

BASE = Path('/root/.openclaw/workspace/FetchNews')
REPORTS = BASE / 'reports'
REPORTS.mkdir(parents=True, exist_ok=True)

# (label, command)
SCRIPTS = [
    ('fetch_reuters.py', ['python3', str(BASE / 'fetch_reuters.py')]),
    ('fetch_bloomberg.py', ['python3', str(BASE / 'fetch_bloomberg.py')]),
    ('fetch_caixin.py', ['python3', str(BASE / 'fetch_caixin.py')]),
    ('fetch_eastmoney.py', ['python3', str(BASE / 'fetch_eastmoney.py')]),
    ('fetch_jin10.py', ['python3', str(BASE / 'fetch_jin10.py')]),
    ('fetch_wallstreetcn.py', ['python3', str(BASE / 'fetch_wallstreetcn.py')]),
    ('fetch_WSJ.py', ['python3', str(BASE / 'fetch_WSJ.py')]),
    ('fetch_google_news.py', ['python3', str(BASE / 'fetch_google_news.py')]),
    ('fetch_polymarket.py', ['python3', str(BASE / 'fetch_polymarket.py')]),
    # 新增：X posts 分层 + useful insights
    ('x_news_fetch.py', ['python3', '/root/.openclaw/workspace/skills/x-news-feed/scripts/x_news_fetch.py', '--hours', '8', '--limit', '15', '--insights']),
]


def run_cmd(label, cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        return label, r.returncode, r.stdout[-25000:], r.stderr[-4000:]
    except subprocess.TimeoutExpired:
        return label, 124, '', 'timeout'


def extract_headlines(text):
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if re.match(r'^\d+\.\s+.+', s):
            lines.append(s)
        elif s.startswith('📰 ') or s.startswith('===') or s.startswith('## '):
            lines.append(s)
        elif re.match(r'^\[\d{2}:\d{2}\]\s+\[T[123]\]', s):
            lines.append(s)
    return lines[:180]


def main():
    ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    raw_path = REPORTS / f'news_raw_{ts}.md'
    head_path = REPORTS / f'news_headlines_{ts}.md'

    raw_parts = [f'# Raw News Capture {ts} UTC\n']
    heads = [f'# Headlines Digest {ts} UTC\n']

    for label, cmd in SCRIPTS:
        script, code, out, err = run_cmd(label, cmd)
        raw_parts.append(f'\n## {script} (exit={code})\n')
        if out:
            raw_parts.append('```\n' + out + '\n```\n')
        if err:
            raw_parts.append('\n[stderr]\n```\n' + err + '\n```\n')

        h = extract_headlines(out)
        heads.append(f'\n## {script} (exit={code})\n')
        if h:
            heads.extend([f'- {x}' for x in h[:40]])
        else:
            heads.append('- (no parsed headlines)')

    raw_path.write_text('\n'.join(raw_parts), encoding='utf-8')
    head_path.write_text('\n'.join(heads), encoding='utf-8')
    print(str(head_path))


if __name__ == '__main__':
    main()
