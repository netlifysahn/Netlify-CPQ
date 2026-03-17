const TAG_REGEX = /<\/?[a-z][^>]*>/i;

const ALLOWED_BLOCK_TAGS = new Set(['P', 'DIV']);
const BULLET_SYMBOL = '\u2022';
const MAX_INDENT_LEVEL = 8;

function hasTagMarkup(value) {
  return TAG_REGEX.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeWhitespace(text) {
  return text.replace(/\u00A0/g, ' ');
}

function getIndentLevel(node) {
  if (!node || typeof node.getAttribute !== 'function') return 0;
  const className = node.getAttribute('class') || '';
  const match = className.match(/\bql-indent-(\d+)\b/);
  if (!match) return 0;
  const level = Number.parseInt(match[1], 10);
  if (!Number.isFinite(level) || level < 0) return 0;
  return Math.min(level, MAX_INDENT_LEVEL);
}

function pushInlineText(target, text, style) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return;
  target.push({ text: normalized, ...style });
}

function collectInline(node, style, output) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    pushInlineText(output, node.textContent || '', style);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.tagName;

  if (tag === 'BR') {
    output.push({ text: '\n', ...style, break: true });
    return;
  }

  const nextStyle = {
    bold: style.bold || tag === 'STRONG' || tag === 'B',
    italic: style.italic || tag === 'EM' || tag === 'I',
    underline: style.underline || tag === 'U',
    href: style.href,
  };

  if (tag === 'A') {
    nextStyle.href = node.getAttribute('href') || '';
    nextStyle.underline = true;
  }

  Array.from(node.childNodes).forEach((child) => collectInline(child, nextStyle, output));
}

function parseBlocksFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  const blocks = [];
  let listGroup = 0;

  const pushParagraphBlock = (node) => {
    const runs = [];
    collectInline(node, { bold: false, italic: false, underline: false, href: '' }, runs);
    if (runs.length > 0) blocks.push({ type: 'paragraph', runs, indentLevel: getIndentLevel(node) });
  };

  const collectListItemRuns = (node) => {
    const runs = [];
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'OL' || child.tagName === 'UL')) return;
      collectInline(child, { bold: false, italic: false, underline: false, href: '' }, runs);
    });
    return runs;
  };

  const walkListNode = (listNode, inheritedIndentLevel = 0, currentListGroup = 0) => {
    if (!listNode || listNode.nodeType !== Node.ELEMENT_NODE) return;
    const listTag = listNode.tagName;
    if (listTag !== 'OL' && listTag !== 'UL') return;

    const items = Array.from(listNode.children).filter((child) => child.tagName === 'LI');
    items.forEach((item, idx) => {
      const dataList = item.getAttribute('data-list');
      const ordered = dataList ? dataList === 'ordered' : listTag === 'OL';
      const explicitIndent = getIndentLevel(item);
      const indentLevel = explicitIndent > 0 ? explicitIndent : inheritedIndentLevel;
      const runs = collectListItemRuns(item);

      if (runs.length > 0) {
        blocks.push({
          type: 'listItem',
          ordered,
          index: idx,
          marker: ordered ? `${idx + 1}.` : BULLET_SYMBOL,
          indentLevel,
          listGroup: currentListGroup,
          runs,
        });
      }

      const nestedLists = Array.from(item.children).filter((child) => child.tagName === 'OL' || child.tagName === 'UL');
      nestedLists.forEach((nestedList) => walkListNode(nestedList, indentLevel + 1, currentListGroup));
    });
  };

  const walkRootNode = (node) => {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const raw = normalizeWhitespace(node.textContent || '').trim();
      if (raw) {
        blocks.push({ type: 'paragraph', runs: [{ text: raw, bold: false, italic: false, underline: false, href: '' }] });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;

    if (tag === 'UL' || tag === 'OL') {
      listGroup += 1;
      walkListNode(node, 0, listGroup);
      return;
    }

    if (ALLOWED_BLOCK_TAGS.has(tag)) {
      pushParagraphBlock(node);
      return;
    }

    if (tag === 'LI') {
      const runs = collectListItemRuns(node);
      if (runs.length > 0) {
        const dataList = node.getAttribute('data-list');
        const ordered = dataList === 'ordered';
        const explicitIndent = getIndentLevel(node);
        blocks.push({
          type: 'listItem',
          ordered,
          index: 0,
          marker: ordered ? '1.' : BULLET_SYMBOL,
          indentLevel: explicitIndent > 0 ? explicitIndent : 0,
          listGroup: listGroup + 1,
          runs,
        });
      }
      const nestedLists = Array.from(node.children).filter((child) => child.tagName === 'OL' || child.tagName === 'UL');
      if (nestedLists.length > 0) {
        listGroup += 1;
        nestedLists.forEach((nestedList) => walkListNode(nestedList, 1, listGroup));
      }
      return;
    }

    const hasElementChildren = Array.from(node.childNodes).some((child) => child.nodeType === Node.ELEMENT_NODE);
    if (!hasElementChildren) {
      pushParagraphBlock(node);
      return;
    }

    Array.from(node.childNodes).forEach((child) => walkRootNode(child));
  };

  Array.from(doc.body.childNodes).forEach((node) => walkRootNode(node));

  if (blocks.length === 0) {
    const plain = normalizeWhitespace(doc.body.textContent || '').trim();
    if (plain) {
      blocks.push({ type: 'paragraph', runs: [{ text: plain, bold: false, italic: false, underline: false, href: '' }] });
    }
  }

  return applyListMarkers(blocks);
}

function toLowerAlphaMarker(index) {
  if (!Number.isFinite(index) || index <= 0) return 'a.';
  let current = index;
  let label = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(97 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return `${label}.`;
}

function applyListMarkers(blocks) {
  const orderedCounters = [];
  let inListContext = false;
  let lastListGroup = null;

  return blocks.map((block) => {
    if (block.type !== 'listItem') {
      inListContext = false;
      lastListGroup = null;
      orderedCounters.length = 0;
      return block;
    }

    const indentLevel = Math.max(0, block.indentLevel || 0);
    if (!inListContext || (block.listGroup != null && block.listGroup !== lastListGroup)) {
      orderedCounters.length = 0;
      inListContext = true;
      lastListGroup = block.listGroup ?? null;
    }

    if (!block.ordered) {
      orderedCounters.length = Math.min(orderedCounters.length, indentLevel + 1);
      return { ...block, marker: BULLET_SYMBOL };
    }

    while (orderedCounters.length <= indentLevel) {
      orderedCounters.push(0);
    }
    orderedCounters[indentLevel] += 1;
    orderedCounters.length = indentLevel + 1;

    const marker = indentLevel === 0
      ? `${orderedCounters[indentLevel]}.`
      : toLowerAlphaMarker(orderedCounters[indentLevel]);

    return { ...block, marker };
  });
}

function toTokens(runs) {
  const tokens = [];

  runs.forEach((run) => {
    const parts = run.text.split(/(\n|\s+)/).filter(Boolean);
    parts.forEach((part) => {
      tokens.push({
        text: part,
        bold: run.bold,
        italic: run.italic,
        underline: run.underline,
        href: run.href,
        isBreak: part === '\n',
      });
    });
  });

  return tokens;
}

function runFontStyle(token) {
  if (token.bold && token.italic) return 'bolditalic';
  if (token.bold) return 'bold';
  if (token.italic) return 'italic';
  return 'normal';
}

function measureToken(doc, token) {
  doc.setFont('helvetica', runFontStyle(token));
  return doc.getTextWidth(token.text);
}

function drawLineRuns(doc, runs, x, y, options) {
  const { fontSize, lineHeight, textColor, linkColor } = options;
  let cursorX = x;

  runs.forEach((run) => {
    if (!run.text) return;

    const width = measureToken(doc, run);
    const color = run.href ? linkColor : textColor;

    doc.setFont('helvetica', runFontStyle(run));
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.text(run.text, cursorX, y);

    if (run.underline) {
      const underlineY = y + 0.75;
      doc.setDrawColor(...color);
      doc.setLineWidth(0.2);
      doc.line(cursorX, underlineY, cursorX + width, underlineY);
    }

    if (run.href) {
      doc.link(cursorX, y - fontSize * 0.8, width, lineHeight, { url: run.href });
    }

    cursorX += width;
  });
}

function splitOversizedToken(doc, token, maxWidth) {
  if (!token.text) return [token];
  const pieces = [];
  let start = 0;

  while (start < token.text.length) {
    let end = start + 1;
    let lastGood = start;

    while (end <= token.text.length) {
      const candidate = { ...token, text: token.text.slice(start, end) };
      if (measureToken(doc, candidate) <= maxWidth) {
        lastGood = end;
        end += 1;
        continue;
      }
      break;
    }

    if (lastGood === start) {
      lastGood = Math.min(start + 1, token.text.length);
    }

    pieces.push({ ...token, text: token.text.slice(start, lastGood) });
    start = lastGood;
  }

  return pieces;
}

export function isRichTextEmpty(html) {
  if (!html) return true;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const text = normalizeWhitespace(doc.body.textContent || '').trim();
  return !text;
}

export function toRichTextHtml(input) {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (hasTagMarkup(trimmed)) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    doc.querySelectorAll('ol ol').forEach((nestedOl) => nestedOl.setAttribute('start', '1'));
    return doc.body.innerHTML;
  }

  const paragraphs = trimmed.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) return '';

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function renderRichText(doc, html, options = {}) {
  const {
    x = 0,
    y = 0,
    maxWidth = 100,
    fontSize = 9,
    lineHeight = 4.5,
    paragraphGap = 3,
    textColor = [26, 26, 26],
    linkColor = [37, 99, 235],
    listIndent = 10,
    indentStep = 8,
    beforeLine = null,
  } = options;

  const normalizedHtml = toRichTextHtml(html);
  const blocks = parseBlocksFromHtml(normalizedHtml);
  if (!blocks.length) return y;

  let cursorY = y;

  blocks.forEach((block, blockIndex) => {
    const marker = block.type === 'listItem' ? `${block.marker} ` : '';
    const markerToken = marker ? { text: marker, bold: false, italic: false, underline: false, href: '' } : null;
    const blockIndent = Math.max(0, block.indentLevel || 0) * indentStep;

    const tokenQueue = toTokens(block.runs);
    const lineStartX = marker ? x + listIndent + blockIndent : x + blockIndent;
    const markerWidth = markerToken ? measureToken(doc, markerToken) : 0;
    const firstLineStartX = marker ? lineStartX + markerWidth : lineStartX;

    const lines = [];
    let currentLine = [];
    let currentWidth = 0;
    const baseWidth = Math.max(12, maxWidth - blockIndent);
    let availableWidth = marker ? Math.max(12, baseWidth - listIndent - markerWidth) : baseWidth;

    const commitLine = () => {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
      availableWidth = marker ? Math.max(12, baseWidth - listIndent) : baseWidth;
    };

    tokenQueue.forEach((token) => {
      if (token.isBreak) {
        commitLine();
        return;
      }

      if (!token.text) return;

      const isWhitespace = /^\s+$/.test(token.text);
      if (isWhitespace && currentLine.length === 0) return;

      const width = measureToken(doc, token);
      const maxLineWidth = currentLine.length === 0 ? availableWidth : marker ? Math.max(12, baseWidth - listIndent) : baseWidth;

      if (width <= maxLineWidth - currentWidth) {
        currentLine.push(token);
        currentWidth += width;
        return;
      }

      if (currentLine.length > 0) {
        commitLine();
      }

      const nextMax = marker ? Math.max(12, baseWidth - listIndent) : baseWidth;
      if (width <= nextMax) {
        if (!isWhitespace) {
          currentLine.push(token);
          currentWidth += width;
        }
        return;
      }

      splitOversizedToken(doc, token, nextMax).forEach((piece, pieceIndex, pieces) => {
        if (!piece.text) return;
        const pieceWidth = measureToken(doc, piece);
        if (currentWidth + pieceWidth > nextMax && currentLine.length > 0) {
          commitLine();
        }
        currentLine.push(piece);
        currentWidth += pieceWidth;
        if (pieceIndex < pieces.length - 1) {
          commitLine();
        }
      });
    });

    if (currentLine.length > 0 || lines.length === 0) {
      lines.push(currentLine);
    }

    lines.forEach((line, lineIndex) => {
      if (typeof beforeLine === 'function') {
        cursorY = beforeLine(cursorY, lineHeight);
      }
      const drawX = lineIndex === 0 ? firstLineStartX : lineStartX;
      if (lineIndex === 0 && markerToken) {
        drawLineRuns(doc, [markerToken], lineStartX, cursorY, { fontSize, lineHeight, textColor, linkColor });
      }
      drawLineRuns(doc, line, drawX, cursorY, { fontSize, lineHeight, textColor, linkColor });
      cursorY += lineHeight;
    });

    if (blockIndex < blocks.length - 1) {
      cursorY += paragraphGap;
    }
  });

  return cursorY;
}
