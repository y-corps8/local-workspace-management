/**
 * Split a command line into argv. Supports '...' and "..." ; no expansion.
 */
export function parseArgvLine(value) {
  const input = String(value ?? "");
  const parts = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = "";
        continue;
      }
      if (ch === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) {
    throw new Error("Unclosed quote in command");
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Join argv into a command line that parseArgvLine can read back.
 * Quotes a part when it is empty or contains whitespace, quotes, or backslash.
 */
export function formatArgvLine(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => {
      const text = String(part ?? "");
      if (text && !/[\s'"\\]/.test(text)) return text;
      return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    })
    .join(" ");
}
