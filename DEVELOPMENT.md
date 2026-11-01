# development notes

## source and history

this standalone repository was extracted from the concept-map app developed in the ga2 workspace. its first seven commits were reconstructed from the actual file-edit checkpoints recorded in the development chat. they follow the original feature sequence; their commit dates are the dates these commits were created.

the final app code was checked against the original app before extraction. the standalone page replaces the course label with a generic notebook label. team ideas, google docs content, local browser profiles, generated previews, and qa downloads are excluded.

## validation

javascript syntax was checked at each recovered checkpoint. the completed editor was exercised in an isolated browser for panning, selection, group movement, color and size changes, text fitting, undo/redo, group persistence, json import/export, and layout overflow on a phone-sized viewport.

## hosting

this is a static site. the repository root contains `index.html`, `style.css`, and `app.js`, which can be served by a static host such as github pages. `.nojekyll` tells github pages to serve these files directly. no remote repository, pages configuration, or deployment is created by this local setup.

maps remain browser-local; sharing the website does not synchronize maps between visitors. use json export/import to share an editable map.
