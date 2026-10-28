# Scene-only Styling

Longform Extended adds the class `longform-extended-leaf` to the container of
every Markdown pane that is part of a project — the project's index file and its
scenes. Pane containers outside a project do not get the class.

That means you can add a CSS snippet to Obsidian and style your writing
environment without changing how other notes look. For example, this snippet
keeps Obsidian dark but makes project panes light:

```css
/* Set some variables for the entire leaf. */
.longform-extended-leaf {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
}

/* Style the editor. */
.longform-extended-leaf .markdown-source-view {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
  --text-selection: #aaa;
  --text-normal: black;
  color: black;
  background-color: white;
}

/* Style text selection. */
.longform-extended-leaf .suggestion-item.is-selected {
  background-color: var(--text-accent);
}

/* Style the header of the leaf. */
.longform-extended-leaf .view-header {
  background-color: white;
}

/* Style the text content of the leaf header. */
.longform-extended-leaf .view-header-title {
  --text-normal: black;
}
```

To use a snippet, place the `.css` file in your vault's `.obsidian/snippets/`
folder and enable it under **Settings → Appearance → CSS snippets**.

> [!NOTE]
> Earlier Longform versions used the class `longform-leaf`. Longform Extended adds
> `longform-extended-leaf`; snippets written for the old class will not match.
> Update the selector if you are bringing a snippet over from Longform.

Longform Extended's own UI uses Obsidian's CSS theme variables where possible, so
it should look at home in your theme.
