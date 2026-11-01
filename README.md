# mind map maker

a small, offline concept-map editor with a notebook-style canvas. built with plain html, css, javascript, and svg. no installation, account, external libraries, or build step required.

## open

double-click `index.html`, keeping `app.js` and `style.css` beside it.

optional: from this folder, run `python -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765`.

## use

- paste one concept per line and choose **add to canvas**. concepts connect in a chain.
- edit text inside a bubble or in the sidebar. drag a bubble’s rim to move it.
- change the selected bubble’s color with a swatch or the color picker.
- click a line to disconnect it. choose **connect** and click two bubbles to reconnect them.
- drag blank paper to pan. use the zoom buttons and **fit** to explore the map.
- use undo and redo to restore edits.
- **save a copy** exports an editable json map. **open map** imports it.

maps autosave in the current browser. browser storage can be cleared or unavailable, so keep exported copies of maps you want to retain. the header reports when autosave is unavailable.

limits: 200 bubbles, 500 characters per bubble, and 3,000 connections. imported maps are validated before replacing the canvas.

## additional controls

- bubble text automatically grows or shrinks to fit, keeping words intact.
- text has safe margins to protect letters from clipping.
- optional embedded starter maps can use an independent autosave key.
- starter maps load even when browser storage is blocked or an older empty save exists.
- select a bubble and use **bubble size** (50%–250%); **apply this size to all bubbles** changes the whole map. text and connecting lines resize automatically, and sizes survive export/import.
- middle-drag anywhere on the canvas to pan.
- ctrl-drag a box around bubbles to select them; bubbles must be fully inside the box. ctrl + shift + drag adds to the selection. ctrl-click toggles individual bubbles.
- change color and size for the entire selection, or drag a selected bubble’s rim to move the selection together.
- under **saved groups**, name a selection and save it. click its name later to recall it; × removes only the group. groups persist in browser saves and exported maps.
- escape clears the selection or cancels an unfinished box. deleting bubbles also updates saved group memberships; undo restores them.

## editor layout

**ideas**, **selection**, and **groups** tabs keep the tool panel focused on the current task. selecting circles opens their selection controls. on tablet and phone screens, **tools** opens the same controls as a bottom sheet; the canvas stays visible first. escape closes the sheet, and its keyboard focus stays inside while it is open.

all fonts and icons are local or drawn in the page. the app still works directly from `index.html`, with no build step or network connection.
