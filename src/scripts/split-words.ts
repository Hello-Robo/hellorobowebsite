/**
 * Wraps every word of an element's text in a span of its own, for the word-by-word reveals:
 * the headlines rising out of their masks (headline-reveal.ts), the reading text lighting up
 * (text-reveal.ts) and the contact block's titles and leads (ContactFlow). The spaces between
 * the words stay plain text, so the lines break as before; markup inside (links, <br>, <em>…)
 * stays where it is.
 */
type Options = {
  /** class of each word's span */
  className: string;
  /** what goes into the text for each word (e.g. the word inside a mask); default the word */
  wrap?: (word: HTMLElement) => Node;
  /** text inside elements matching this stays as it is (e.g. links keep their own hover) */
  skip?: string;
  /** what separates words (default: spaces, so a no-break space keeps two words together) */
  space?: RegExp;
  /** give each word its turn as --d (0, 1, 2… across the element), for a staggered motion */
  stagger?: boolean;
};

/** Returns the word spans, in reading order */
export function splitWords(el: HTMLElement, { className, wrap, skip, space = / +/, stagger = false }: Options): HTMLElement[] {
  const words: HTMLElement[] = [];
  const walker = document.createTreeWalker(
    el,
    NodeFilter.SHOW_TEXT,
    skip ? { acceptNode: (n) => (n.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) } : null,
  );
  const texts: Text[] = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) texts.push(t as Text);
  // split() with a capturing group keeps the separators: every odd part is one
  const parts = new RegExp(`(${space.source})`);
  for (const text of texts) {
    const frag = document.createDocumentFragment();
    text.nodeValue!.split(parts).forEach((part, i) => {
      if (!part) return;
      if (i % 2) return frag.append(part);
      const word = document.createElement('span');
      word.className = className;
      if (stagger) word.style.setProperty('--d', String(words.length));
      word.textContent = part;
      words.push(word);
      frag.append(wrap ? wrap(word) : word);
    });
    text.replaceWith(frag);
  }
  return words;
}
