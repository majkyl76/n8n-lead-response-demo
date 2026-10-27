#!/usr/bin/env python3
"""Redraws docs/workflow-diagram.png from workflows/*.json.

Node names, order and the number of HTTP tries come from the workflow
files, not from anything typed in here. Fill colour shows the kind of node
(trigger or log, plain logic, HTTP call to a placeholder endpoint, error
handler). A dashed border means test/workflows.test.js runs that node's
actual jsCode or expression. That list is kept by hand in TESTED below,
because the workflow JSON doesn't say what the tests cover.
"""

import json
import textwrap
from PIL import Image, ImageDraw, ImageFont

W = 1500
BG = (250, 251, 253)
BORDER = (80, 90, 110)
ARROW = (60, 70, 90)
TITLE = (30, 35, 45)
NODE_TITLE = (20, 25, 35)
NODE_SUB = (95, 103, 111)
CAPTION = (90, 100, 112)
TESTED_BORDER = (31, 110, 98)

FILL = {
    'blue': (222, 236, 255),
    'yellow': (255, 244, 214),
    'green': (226, 247, 232),
    'pink': (255, 226, 226),
}

# Nodes whose own logic (not just the data passing through) is checked in
# test/workflows.test.js, and a fill colour per node by role. Neither can
# be worked out from the workflow JSON, so both are written out here.
TESTED = {'Validate payload', 'Dedupe', 'Send SMS', 'Log result'}
CATEGORY = {
    'Webhook': 'blue',
    'Validate payload': 'yellow',
    'Dedupe': 'yellow',
    'Draft reply': 'green',
    'Send SMS': 'green',
    'Log result': 'blue',
}

# Font paths to try in order: DejaVu on most Linux boxes, then macOS and
# Windows system fonts. If none exist, Pillow's built-in bitmap font is used.
BOLD_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial Bold.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
]
REGULAR_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
]


def load_font(candidates, size):
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


f_title = load_font(BOLD_CANDIDATES, 20)
f_node_title = load_font(BOLD_CANDIDATES, 16)
f_node_sub = load_font(REGULAR_CANDIDATES, 12)
f_caption = load_font(REGULAR_CANDIDATES, 13)
f_section = load_font(BOLD_CANDIDATES, 18)


def load_workflow(name):
    with open('workflows/' + name) as f:
        return json.load(f)


def ordered_nodes(workflow, start_types):
    by_name = {n['name']: n for n in workflow['nodes']}
    start = next(n['name'] for n in workflow['nodes'] if n['type'] in start_types)
    order = [start]
    current = start
    connections = workflow['connections']
    while current in connections:
        targets = connections[current].get('main', [[]])[0]
        if not targets:
            break
        current = targets[0]['node']
        order.append(current)
    return [by_name[name] for name in order]


def subtitle(node):
    t = node['type']
    p = node.get('parameters', {})
    if t == 'n8n-nodes-base.webhook':
        return '%s /%s' % (p.get('httpMethod', 'POST'), p.get('path', ''))
    if t == 'n8n-nodes-base.httpRequest' and node.get('retryOnFail'):
        return '%d tries, 2 s apart' % node['maxTries']
    if node['name'] == 'Validate payload':
        return 'id, name, phone, message'
    if node['name'] == 'Dedupe':
        return 'skip repeated lead id'
    if node['name'] == 'Error Trigger':
        return 'any failed run'
    if node['name'] == 'Format message':
        return 'workflow, node, error, URL'
    if node['name'] == 'Send alert':
        return 'placeholder endpoint'
    return ''


lead_response = load_workflow('lead-response.json')
error_handler = load_workflow('error-handler.json')

lr_nodes = ordered_nodes(lead_response, {'n8n-nodes-base.webhook'})
eh_nodes = ordered_nodes(error_handler, {'n8n-nodes-base.errorTrigger'})

img = Image.new('RGB', (W, 900), BG)
draw = ImageDraw.Draw(img)


def rounded_box(xy, fill, dashed):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=10, fill=fill, outline=BORDER, width=2)
    if dashed:
        dash, gap = 8, 5
        for y in (y0 + 4, y1 - 4):
            x = x0 + 4
            while x < x1 - 4:
                x2 = min(x + dash, x1 - 4)
                draw.line([(x, y), (x2, y)], fill=TESTED_BORDER, width=2)
                x += dash + gap
        for x in (x0 + 4, x1 - 4):
            y = y0 + 4
            while y < y1 - 4:
                y2 = min(y + dash, y1 - 4)
                draw.line([(x, y), (x, y2)], fill=TESTED_BORDER, width=2)
                y += dash + gap


def draw_node(x, y, w, h, title, sub, fill, dashed):
    xy = (x, y, x + w, y + h)
    rounded_box(xy, FILL[fill], dashed)
    tw = draw.textlength(title, font=f_node_title)
    draw.text((x + (w - tw) / 2, y + h / 2 - 20), title, font=f_node_title, fill=NODE_TITLE)
    sw = draw.textlength(sub, font=f_node_sub)
    draw.text((x + (w - sw) / 2, y + h / 2 + 4), sub, font=f_node_sub, fill=NODE_SUB)
    return xy


def arrow(x0, y, x1):
    draw.line([(x0, y), (x1 - 12, y)], fill=ARROW, width=3)
    draw.polygon([(x1, y), (x1 - 12, y - 6), (x1 - 12, y + 6)], fill=ARROW)


draw.text((30, 18), 'Lead response workflow (structure of workflows/*.json)', font=f_title, fill=TITLE)

row_y = 108
box_w, box_h, gap = 204, 90, 42
boxes = []
x = 30
for n in lr_nodes:
    cat = CATEGORY[n['name']]
    boxes.append(draw_node(x, row_y, box_w, box_h, n['name'], subtitle(n), cat, n['name'] in TESTED))
    x += box_w + gap

for (x0, y0, x1, y1), nxt in zip(boxes, boxes[1:]):
    arrow(x1, row_y + box_h / 2, nxt[0])

draw.text((30, row_y + box_h + 20),
          'Main workflow. Settings point at an error workflow (placeholder id ERROR_WORKFLOW_ID).',
          font=f_caption, fill=CAPTION)

draw.line([(30, 290), (W - 30, 290)], fill=(220, 222, 228), width=1)
draw.text((30, 308), 'Error workflow', font=f_section, fill=TITLE)

eh_y = 352
eh_w, eh_h = 224, 90
eh_boxes = []
x = 30
for n in eh_nodes:
    eh_boxes.append(draw_node(x, eh_y, eh_w, eh_h, n['name'], subtitle(n), 'pink', n['name'] in TESTED))
    x += eh_w + gap

for (x0, y0, x1, y1), nxt in zip(eh_boxes, eh_boxes[1:]):
    arrow(x1, eh_y + eh_h / 2, nxt[0])

legend = (
    'Legend: blue = trigger / log, yellow = standalone logic code, green = HTTP calls to '
    'placeholder endpoints (example.invalid), pink = error handler. Dashed border = node '
    'logic checked directly in test/workflows.test.js (Validate payload, Dedupe, the Send SMS '
    'jsonBody expression, the Log result jsCode).'
)
ly = eh_y + eh_h + 28
for line in textwrap.wrap(legend, width=118):
    draw.text((30, ly), line, font=f_caption, fill=CAPTION)
    ly += 20

img = img.crop((0, 0, W, ly + 10))
img.save('docs/workflow-diagram.png')
print('saved', img.size)
