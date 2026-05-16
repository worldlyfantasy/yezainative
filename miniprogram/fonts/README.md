Yezai Serif Title is a Noto Serif SC subset used for title text.

Source: Google Fonts, Noto Serif Simplified Chinese.
License: SIL Open Font License 1.1.

`app.js` registers the remote TTF subset as `Yezai Songti Fixed` on startup.
Only fixed UI headings should use this family.

Dynamic cloud content such as creator names, service titles, and idea titles
should use the system serif fallback stack instead. That avoids mixed-font
fallback when future content contains characters outside the custom subset.

The current fixed subset is about 268KB and covers the static Chinese text in
the mini program source. Keep it as a remote CloudBase asset rather than
embedding it as base64 inside JavaScript.
