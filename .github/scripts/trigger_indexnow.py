#!/usr/bin/env python3
"""
IndexNow automated push notification script for guobug.github.io.
Detects added/modified blog posts and core pages, maps them to canonical URLs,
and notifies the IndexNow API (api.indexnow.org).
"""

import os
import sys
import json
import re
import glob
import urllib.request
import urllib.error
import subprocess

HOST = "guobug.github.io"
KEY = "1a80b0d890a5499d9a25fa10002f08df"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"

def parse_post_url(filepath: str) -> str:
    """
    Given _posts/YYYY-MM-DD-title.md, derive canonical URL:
    https://guobug.github.io/posts/YYYY/MM/DD/title/
    """
    basename = os.path.basename(filepath)
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$", basename)
    if match:
        year, month, day, title = match.groups()
        return f"https://{HOST}/posts/{year}/{month}/{day}/{title}/"
    return ""

def get_changed_files() -> list:
    before = os.environ.get("GIT_BEFORE", "").strip()
    after = os.environ.get("GIT_AFTER", "HEAD").strip()
    
    if before and before != "0000000000000000000000000000000000000000":
        cmd = ["git", "diff", "--name-only", before, after]
    else:
        cmd = ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        files = [line.strip() for line in res.stdout.strip().splitlines() if line.strip()]
        return files
    except Exception as e:
        print(f"Warning: git diff command failed ({e}). Falling back to recent files.")
        return []

def get_latest_posts(count: int = 5) -> list:
    posts = sorted(glob.glob("_posts/*.md"), reverse=True)
    urls = []
    for p in posts[:count]:
        u = parse_post_url(p)
        if u:
            urls.append(u)
    return urls

def main():
    changed_files = get_changed_files()
    print(f"Detected changed files in commit: {changed_files}")

    urls = set()

    for f in changed_files:
        f_norm = f.replace("\\", "/")
        if f_norm.startswith("_posts/") and f_norm.endswith(".md"):
            url = parse_post_url(f_norm)
            if url:
                urls.add(url)
        elif f_norm == "llms.txt":
            urls.add(f"https://{HOST}/llms.txt")
        elif f_norm == "llms-full.txt":
            urls.add(f"https://{HOST}/llms-full.txt")
        elif f_norm == "index.html":
            urls.add(f"https://{HOST}/")
        elif f_norm == "about.html":
            urls.add(f"https://{HOST}/about/")
        elif f_norm == "projects.html":
            urls.add(f"https://{HOST}/projects.html")
        elif f_norm == "sitemap.xml":
            urls.add(f"https://{HOST}/sitemap.xml")

    # If no URLs matched from diff (e.g. manual dispatch or non-post change), fallback to recent posts
    if not urls:
        print("No direct post/page URLs identified from git diff. Falling back to latest posts.")
        for u in get_latest_posts(3):
            urls.add(u)
        urls.add(f"https://{HOST}/llms.txt")
        urls.add(f"https://{HOST}/llms-full.txt")
        urls.add(f"https://{HOST}/sitemap.xml")

    url_list = sorted(list(urls))
    print(f"Submitting {len(url_list)} URL(s) to IndexNow:")
    for u in url_list:
        print(f" - {u}")

    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": url_list
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        INDEXNOW_ENDPOINT,
        data=req_data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "IndexNow-Automation/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.status
            body = response.read().decode("utf-8", errors="ignore")
            print(f"IndexNow API response status: {status} ({response.reason})")
            if body:
                print(f"Response body: {body}")
            if status in (200, 202):
                print("IndexNow submission succeeded!")
            else:
                print(f"Warning: Unexpected response status {status}")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        print(f"HTTPError: {e.code} {e.reason}")
        print(f"Details: {error_body}")
        sys.exit(1)
    except Exception as e:
        print(f"Network error submitting to IndexNow: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
