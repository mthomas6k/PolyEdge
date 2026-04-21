#!/usr/bin/env python3
"""
Replaces the contents of pm-track elements in index.html with
the full set of base64 payment logos from payment-slider.html.

Uses proper nested-div counting instead of regex to avoid the
classic "non-greedy match eats only the first item" bug.
"""
import sys, os

SLIDER_PATH = '/Users/marshall/Downloads/payment-slider.html'
INDEX_PATH  = '/Users/marshall/Downloads/PolyEdge-main/index.html'

# ── 1. Extract all <div class="pm-item">…</div> blocks from the slider ──
with open(SLIDER_PATH, 'r', encoding='utf-8') as f:
    slider = f.read()

items = []
search_from = 0
while True:
    start = slider.find('<div class="pm-item">', search_from)
    if start == -1:
        break
    # Walk forward counting div depth to find the matching </div>
    depth = 0
    i = start
    while i < len(slider):
        if slider[i:i+4] == '<div':
            depth += 1
        elif slider[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                items.append(slider[start:i+6])
                search_from = i + 6
                break
        i += 1
    else:
        break

if not items:
    print("ERROR: No pm-item blocks found in", SLIDER_PATH)
    sys.exit(1)

print(f"Extracted {len(items)} logo items from payment-slider.html")

# ── 2. Build the new inner HTML for each track ──
inner = "\n          ".join(items)

# ── 3. Replace each pm-track in index.html using depth-counted parsing ──
with open(INDEX_PATH, 'r', encoding='utf-8') as f:
    html = f.read()

def replace_track(html, track_id, new_inner):
    """Replace the children of <div class="pm-track" id="TRACK_ID"> with new_inner."""
    tag = f'<div class="pm-track" id="{track_id}">'
    start = html.find(tag)
    if start == -1:
        print(f"  WARNING: {track_id} not found")
        return html

    content_start = start + len(tag)

    # Walk forward from content_start, counting div depth to find matching </div>
    depth = 1          # we already opened the pm-track div
    i = content_start
    while i < len(html):
        if html[i:i+4] == '<div':
            depth += 1
        elif html[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                # i is the position of the </div> that closes the pm-track
                replacement = f'{tag}\n          {new_inner}\n        </div>'
                html = html[:start] + replacement + html[i+6:]
                print(f"  Replaced {track_id} ({i - content_start} -> {len(new_inner)} chars)")
                return html
        i += 1

    print(f"  WARNING: could not find closing </div> for {track_id}")
    return html

html = replace_track(html, 'pay-marquee-home', inner)
html = replace_track(html, 'pay-marquee-challenges', inner)

with open(INDEX_PATH, 'w', encoding='utf-8') as f:
    f.write(html)

print("Done ✓")
