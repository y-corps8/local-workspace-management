/**
 * Detect choice / confirm prompts from a job’s recent log text.
 * Free-text questions return null — Console has buttons only.
 */

const ANSI_RE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|].*?(?:\u0007|\u001B\\))/g;

const CONFIRM_TAIL_RE =
  /(?:[›»]\s*)?(?:[\(\[]\s*([yYnN])(?:es|o)?\s*[\/|]\s*([yYnN])(?:es|o)?\s*[\)\]]|\(\s*([yYnN])(?:es)?\s*\))\s*$/;
const YES_NO_WORD_RE = /(?:^|[^\w])yes\/no\s*$/i;
const CHOICE_YES_NO_RE = /(?:^|[^\w])((?:Yes|No)\s*\/\s*(?:Yes|No))\s*$/;
const NUMBERED_RE = /^(?:[❯>]\s*)?(\d+)[.)]\s+(\S.*)$/;
const POINTER_RE = /^[❯>]\s+(\S.*)$/;
const FREE_TEXT_RE =
  /\benter\s+a\s+(?:name|value|path|string|text|title|message)\b|\btype\s+(?:a|the|your)\b/i;
const PRESS_ENTER_RE =
  /(?:^|[^\w])(?:press|hit)\s+(?:(?:the\s+)?(?:enter|return)(?:\s+key)?|any\s+key)(?:\s+to\s+\S.*)?\s*$/i;

export function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_RE, "");
}

function lastNonEmptyLine(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim()) return lines[i];
  }
  return "";
}

function splitLines(text) {
  return stripAnsi(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
}

function looksLikeHelpLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^›?\s*press\s+/i.test(trimmed)) return true;
  if (/\bshift\+[a-z]/i.test(trimmed)) return true;
  if (/show all commands/i.test(trimmed)) return true;
  return false;
}

function looksLikeStackLine(line) {
  return /^\s*at\s+\S+/.test(line) || /^\s*Error\b/.test(line);
}

function optionId(label, fallback) {
  const slug = String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || fallback).slice(0, 40);
}

function cleanQuestion(line) {
  return String(line || "")
    .replace(/^\s*[?✔●]\s*/, "")
    .replace(/\s*\(Use arrow keys\)\s*$/i, "")
    .replace(/\s*[›»…]\s*$/g, "")
    .replace(/\s*(?:[›»]\s*)?(?:[\(\[]\s*[yYnN](?:es|o)?\s*[\/|]\s*[yYnN](?:es|o)?\s*[\)\]]|\(\s*[yYnN](?:es)?\s*\))\s*$/, "")
    .replace(/\s*(?:Yes|No)\s*\/\s*(?:Yes|No)\s*$/, "")
    .replace(/\s*[›»…:]\s*$/g, "")
    .trim();
}

function confirmOptions() {
  return [
    { id: "yes", label: "Yes", value: "y" },
    { id: "no", label: "No", value: "n" },
  ];
}

function enterOptions() {
  return [{ id: "enter", label: "Enter", value: "" }];
}

function parsePressEnter(line) {
  const trimmed = line.trim();
  if (!trimmed || looksLikeStackLine(trimmed)) return null;
  if (!PRESS_ENTER_RE.test(trimmed)) return null;
  const question = cleanQuestion(trimmed) || "Press Enter to continue";
  return { kind: "enter", question, options: enterOptions() };
}

function parseConfirm(line) {
  const trimmed = line.trim();
  if (!trimmed || looksLikeHelpLine(trimmed) || looksLikeStackLine(trimmed)) return null;
  if (CONFIRM_TAIL_RE.test(trimmed) || YES_NO_WORD_RE.test(trimmed)) {
    const question = cleanQuestion(trimmed);
    if (!question) return null;
    return { kind: "confirm", question, options: confirmOptions() };
  }
  return null;
}

function parseYesNoChoice(line) {
  const trimmed = line.trim();
  if (!trimmed || looksLikeHelpLine(trimmed)) return null;
  const match = trimmed.match(CHOICE_YES_NO_RE);
  if (!match) return null;
  const pair = match[1].split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  if (pair.length !== 2) return null;
  if (new Set(pair.map((part) => part.toLowerCase())).size !== 2) return null;
  const question = cleanQuestion(trimmed);
  if (!question) return null;
  return {
    kind: "choice",
    question,
    options: pair.map((label, index) => ({
      id: optionId(label, `opt-${index}`),
      label,
      value: label,
    })),
  };
}

function questionBefore(lines, start) {
  for (let i = start - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (NUMBERED_RE.test(line) || POINTER_RE.test(line)) continue;
    if (looksLikeHelpLine(line) || looksLikeStackLine(line)) continue;
    return cleanQuestion(line);
  }
  return "";
}

function parseNumberedChoices(lines) {
  const options = [];
  let first = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].trim().match(NUMBERED_RE);
    if (!match) continue;
    if (looksLikeHelpLine(lines[i])) continue;
    if (first < 0) first = i;
    options.push({
      id: optionId(match[2], match[1]),
      label: match[2].trim(),
      value: match[1],
    });
  }
  if (options.length < 2) return null;
  const lastLine = lastNonEmptyLine(lines);
  if (!NUMBERED_RE.test(lastLine.trim())) return null;
  const question = questionBefore(lines, first) || "Choose an option";
  return { kind: "choice", question, options };
}

function parseInquirerList(lines) {
  const start = lines.findIndex((line) => POINTER_RE.test(line.trim()) && !looksLikeHelpLine(line));
  if (start < 0) return null;
  const options = [];
  for (let i = start; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (options.length) break;
      continue;
    }
    const pointer = trimmed.match(POINTER_RE);
    const numbered = trimmed.match(NUMBERED_RE);
    if (numbered) return null;
    if (pointer) {
      if (looksLikeHelpLine(trimmed)) return null;
      options.push({
        id: optionId(pointer[1], `opt-${options.length}`),
        label: pointer[1].trim(),
        value: pointer[1].trim(),
      });
      continue;
    }
    if (looksLikeHelpLine(trimmed) || looksLikeStackLine(trimmed)) break;
    if (/^[?✔●]/.test(trimmed)) break;
    if (options.length && /^\S/.test(lines[i]) && !/^\s/.test(lines[i])) break;
    options.push({
      id: optionId(trimmed, `opt-${options.length}`),
      label: trimmed,
      value: trimmed,
    });
  }
  if (options.length < 2) return null;
  const lastLine = lastNonEmptyLine(lines).trim();
  const lastIsOption = POINTER_RE.test(lastLine) || (!NUMBERED_RE.test(lastLine) && options.some((option) => option.label === lastLine));
  if (!lastIsOption) return null;
  const question = questionBefore(lines, start) || "Choose an option";
  return { kind: "choice", question, options };
}

function isFreeTextQuestion(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (
    CONFIRM_TAIL_RE.test(trimmed) ||
    YES_NO_WORD_RE.test(trimmed) ||
    CHOICE_YES_NO_RE.test(trimmed) ||
    PRESS_ENTER_RE.test(trimmed)
  ) {
    return false;
  }
  if (FREE_TEXT_RE.test(trimmed)) return true;
  if (/^\s*[?✔●].*[›»…:]\s*$/.test(trimmed) && !NUMBERED_RE.test(trimmed)) return true;
  return false;
}

/**
 * Parse recent log text (partial + last completed lines) for a blocking choice prompt.
 * @returns {{ kind: "confirm" | "choice" | "enter", question: string, options: { id: string, label: string, value: string }[] } | null}
 */
export function detectPrompt(text) {
  const lines = splitLines(text);
  if (!lines.some((line) => line.trim())) return null;

  const last = lastNonEmptyLine(lines);
  const pressEnter = parsePressEnter(last);
  if (pressEnter) return pressEnter;
  if (looksLikeHelpLine(last) || looksLikeStackLine(last)) return null;
  if (isFreeTextQuestion(last)) return null;

  return parseConfirm(last) || parseYesNoChoice(last) || parseNumberedChoices(lines) || parseInquirerList(lines);
}

export function publicPrompt(prompt) {
  if (!prompt || !Array.isArray(prompt.options) || !prompt.options.length) return null;
  const kind = prompt.kind === "choice" ? "choice" : prompt.kind === "enter" ? "enter" : "confirm";
  return {
    kind,
    question: String(prompt.question || "").slice(0, 400),
    options: prompt.options.slice(0, 12).map((option, index) => ({
      id: String(option.id || `opt-${index}`).slice(0, 40),
      label: String(option.label || "").slice(0, 80),
      value: String(option.value ?? "").slice(0, 200),
    })),
  };
}

export function promptsEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
