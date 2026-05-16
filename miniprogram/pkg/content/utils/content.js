const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/;
const QUOTE_PATTERN = /^>\s?(.*)$/;
const IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const ORDERED_LIST_PATTERN = /^(\d+)\.\s+(.*)$/;
const UNORDERED_LIST_PATTERN = /^[-*+]\s+(.*)$/;

function isHorizontalRule(line) {
  return /^((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(String(line || "").trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url) {
  const normalized = String(url || "").trim();

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return "";
}

function renderInlineMarkdown(content) {
  const source = String(content || "");
  const tokenPattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`)/g;
  let html = "";
  let lastIndex = 0;
  let match = tokenPattern.exec(source);

  while (match) {
    html += escapeHtml(source.slice(lastIndex, match.index));

    if (match[2] && match[3]) {
      const href = sanitizeUrl(match[3]);
      const label = escapeHtml(match[2]);
      html += href
        ? `<a href="${escapeHtml(href)}" style="color: #8d4d2f; text-decoration: underline;">${label}</a>`
        : label;
    } else if (match[4] || match[5]) {
      const strongContent = match[4] || match[5];
      html += `<strong style="font-weight: 600; color: #2b241d;">${escapeHtml(strongContent)}</strong>`;
    } else if (match[6] || match[7]) {
      const emphasisContent = match[6] || match[7];
      html += `<em style="font-style: italic; color: #7a6557;">${escapeHtml(emphasisContent)}</em>`;
    } else if (match[8]) {
      html += `<code style="padding: 1px 6px; border-radius: 6px; background: rgba(153, 57, 33, 0.08); font-size: 0.95em; color: #7a3f2b;">${escapeHtml(match[8])}</code>`;
    }

    lastIndex = tokenPattern.lastIndex;
    match = tokenPattern.exec(source);
  }

  html += escapeHtml(source.slice(lastIndex));
  return html.replace(/\n/g, "<br/>");
}

function parseIdeaBody(body) {
  const lines = String(body || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  const paragraphLines = [];

  function pushParagraph() {
    const content = paragraphLines.join("\n").trim();
    paragraphLines.length = 0;

    if (!content) {
      return;
    }

    blocks.push({
      id: `block-${blocks.length}`,
      type: "paragraph",
      content
    });
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      pushParagraph();
      continue;
    }

    if (isHorizontalRule(trimmedLine)) {
      pushParagraph();
      blocks.push({
        id: `block-${blocks.length}`,
        type: "hr",
        content: ""
      });
      continue;
    }

    const headingMatch = trimmedLine.match(HEADING_PATTERN);
    if (headingMatch) {
      pushParagraph();
      blocks.push({
        id: `block-${blocks.length}`,
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2].trim()
      });
      continue;
    }

    const imageMatch = trimmedLine.match(IMAGE_PATTERN);
    if (imageMatch) {
      pushParagraph();
      const imageUrl = sanitizeUrl(imageMatch[2]);
      if (imageUrl) {
        blocks.push({
          id: `block-${blocks.length}`,
          type: "image",
          alt: imageMatch[1].trim(),
          src: imageUrl
        });
      }
      continue;
    }

    if (QUOTE_PATTERN.test(trimmedLine)) {
      pushParagraph();

      const quoteLines = [];
      while (index < lines.length) {
        const quoteMatch = lines[index].trim().match(QUOTE_PATTERN);
        if (!quoteMatch) {
          break;
        }

        quoteLines.push(quoteMatch[1]);
        index += 1;
      }

      index -= 1;
      const quoteContent = quoteLines.join("\n").trim();
      if (quoteContent) {
        blocks.push({
          id: `block-${blocks.length}`,
          type: "quote",
          content: quoteContent
        });
      }
      continue;
    }

    if (ORDERED_LIST_PATTERN.test(trimmedLine) || UNORDERED_LIST_PATTERN.test(trimmedLine)) {
      pushParagraph();

      const listType = ORDERED_LIST_PATTERN.test(trimmedLine) ? "ordered-list" : "unordered-list";
      const items = [];

      while (index < lines.length) {
        const currentLine = lines[index].trim();
        const orderedMatch = currentLine.match(ORDERED_LIST_PATTERN);
        const unorderedMatch = currentLine.match(UNORDERED_LIST_PATTERN);

        if (listType === "ordered-list" && orderedMatch) {
          items.push(orderedMatch[2].trim());
          index += 1;
          continue;
        }

        if (listType === "unordered-list" && unorderedMatch) {
          items.push(unorderedMatch[1].trim());
          index += 1;
          continue;
        }

        break;
      }

      index -= 1;
      if (items.length) {
        blocks.push({
          id: `block-${blocks.length}`,
          type: listType,
          items
        });
      }
      continue;
    }

    paragraphLines.push(trimmedLine);
  }

  pushParagraph();
  return blocks;
}

function renderIdeaBodyRichText(body) {
  return parseIdeaBody(body)
    .map((block) => {
      if (block.type === "hr") {
        return "<hr style=\"display: block; margin: 24px 0 18px; border: 0; border-top: 1px solid rgba(153, 57, 33, 0.18);\"/>";
      }

      if (block.type === "heading") {
        const headingTag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
        const fontSize = block.level === 1 ? 24 : block.level === 2 ? 22 : 20;
        const marginBottom = block.level === 1 ? 18 : 16;

        return `<${headingTag} style="display: block; margin: 0 0 ${marginBottom}px; font-family: 'Songti SC', 'STSong', 'Noto Serif SC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif; font-size: ${fontSize}px; line-height: 1.8; font-weight: 500; color: #2b241d;">${renderInlineMarkdown(block.content)}</${headingTag}>`;
      }

      if (block.type === "quote") {
        return `<blockquote style="display: block; margin: 0 0 18px; padding-left: 12px; border-left: 2px solid rgba(153, 57, 33, 0.22); font-size: 15px; line-height: 2.05; color: #6a5a4b;">${renderInlineMarkdown(block.content)}</blockquote>`;
      }

      if (block.type === "ordered-list" || block.type === "unordered-list") {
        const listTag = block.type === "ordered-list" ? "ol" : "ul";
        const listItems = (block.items || [])
          .map((item) => `<li style="margin: 0 0 8px;">${renderInlineMarkdown(item)}</li>`)
          .join("");

        return `<${listTag} style="display: block; margin: 0 0 18px; padding-left: 24px; font-size: 16px; line-height: 2.05; color: #5f5246;">${listItems}</${listTag}>`;
      }

      if (block.type === "image") {
        const alt = escapeHtml(block.alt || "");
        return `<img src="${escapeHtml(block.src)}" alt="${alt}" style="display: block; width: 100%; margin: 6px 0 18px; border-radius: 16px;" />`;
      }

      return `<p style="display: block; margin: 0 0 18px; font-size: 16px; line-height: 2.15; color: #5f5246;">${renderInlineMarkdown(block.content)}</p>`;
    })
    .join("");
}

module.exports = {
  parseIdeaBody,
  renderIdeaBodyRichText
};
