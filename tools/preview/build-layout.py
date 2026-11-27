#!/usr/bin/env python3
# Builds the layout the preview window shows from layouts/x-mas-paper.json: the scene, the rail,
# the accounts and the tabs read invented demo data, and the terminal block becomes a fake
# terminal panel. Prints the JSON, or writes it to the given path.
#   build-layout.py [<out.json>]
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "layouts", "x-mas-paper.json")
TERM_MOD = "x-mas-paper-demo-term"
PREFIX = "x-mas-paper-"


def fail(message):
    sys.stderr.write("build-layout.py: %s in %s\n" % (message, SRC))
    sys.exit(1)


def usage(message=None):
    if message:
        sys.stderr.write("build-layout.py: %s\n" % message)
    sys.stderr.write("build-layout.py: usage: build-layout.py [<out.json>]\n")
    sys.exit(2)


def walk(node, found):
    if node.get("id") == "main":
        content = node.get("content") or {}
        if "tab" not in content and "pane" not in content:
            fail("the 'main' block does not hold a terminal")
        found["main"] += 1
        node["content"] = {"mod": TERM_MOD}
        return node
    content = node.get("content")
    if isinstance(content, dict):
        mod = content.get("mod")
        if isinstance(mod, str) and mod.startswith(PREFIX):
            found["mods"][mod] = found["mods"].get(mod, 0) + 1
            props = content.get("props") or {}
            props["demo"] = True
            content["props"] = props
    children = node.get("children")
    if isinstance(children, list):
        node["children"] = [walk(child, found) for child in children]
    floating = node.get("floating")
    if isinstance(floating, list):
        node["floating"] = [walk(entry, found) for entry in floating]
    return node


out = None
if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1].startswith("-")):
    usage()
if len(sys.argv) == 2:
    out = sys.argv[1]

with open(SRC) as f:
    layout = json.load(f)

found = {"mods": {}, "main": 0}
walk(layout, found)

if found["main"] != 1:
    fail("one 'main' block (found %d)" % found["main"])
for mod in ("x-mas-paper-scene", "x-mas-paper-rail", "x-mas-paper-accounts", "x-mas-paper-tabs"):
    if not found["mods"].get(mod):
        fail("the %s block" % mod)

# A Herdr notification names a real session; the silent toast mod keeps it out of the picture.
layout["toast"] = "x-mas-paper-demo-toast"
text = json.dumps(layout, indent=2) + "\n"
if out:
    with open(out, "w") as f:
        f.write(text)
else:
    sys.stdout.write(text)
