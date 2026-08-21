import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPrompt, publicPrompt, stripAnsi } from "../../src/jobs/prompt.mjs";

test("detects Prisma reset confirm", () => {
  const prompt = detectPrompt(
    "? Are you sure you want to reset? All data will be lost. › (y/N)"
  );
  assert.equal(prompt?.kind, "confirm");
  assert.match(prompt.question, /reset/i);
  assert.deepEqual(
    prompt.options.map((option) => option.value),
    ["y", "n"]
  );
});

test("detects npm Ok to proceed (y)", () => {
  const prompt = detectPrompt("Ok to proceed? (y)");
  assert.equal(prompt?.kind, "confirm");
  assert.equal(prompt.question, "Ok to proceed?");
  assert.equal(prompt.options[0].value, "y");
});

test("detects trailing No / Yes as choice labels", () => {
  const prompt = detectPrompt("? Would you like to use TypeScript? › No / Yes");
  assert.equal(prompt?.kind, "choice");
  assert.deepEqual(
    prompt.options.map((option) => option.value),
    ["No", "Yes"]
  );
});

test("detects numbered list on the last lines", () => {
  const prompt = detectPrompt(`? Which database do you want to use?
1) PostgreSQL
2) MySQL
3) SQLite`);
  assert.equal(prompt?.kind, "choice");
  assert.match(prompt.question, /database/i);
  assert.deepEqual(
    prompt.options.map((option) => option.value),
    ["1", "2", "3"]
  );
  assert.equal(prompt.options[0].label, "PostgreSQL");
});

test("strips ANSI before matching (y/N)", () => {
  const raw = `\u001B[36m?\u001B[39m Continue?\u001B[1m › (y/N)\u001B[22m`;
  assert.match(stripAnsi(raw), /\(y\/N\)/);
  const prompt = detectPrompt(raw);
  assert.equal(prompt?.kind, "confirm");
  assert.equal(prompt.question, "Continue?");
});

test("ignores Expo / Metro help", () => {
  assert.equal(detectPrompt("› Press r │ reload app"), null);
  assert.equal(detectPrompt("shift+m  more tools\nPress ? │ show all commands"), null);
});

test("ignores npm script headers that start with >", () => {
  assert.equal(
    detectPrompt(`> bs-app@1.0.0 android
> npx expo run:android`),
    null
  );
});

test("ignores Gradle > Task and Configure project logs", () => {
  assert.equal(
    detectPrompt(`> Configure project :app
> Task :app:compileDebugJavaWithJavac
> Task :app:installDebug`),
    null
  );
});

test("ignores nested Gradle error lines that start with >", () => {
  assert.equal(
    detectPrompt(`Could not resolve all dependencies for configuration ':app:debugRuntimeClasspath'.
> Could not resolve all dependencies for configuration ':app:debugRuntimeClasspath'.
   > A problem occurred configuring project ':react-native-reanimated'.`),
    null
  );
});

test("detects press enter to continue", () => {
  const prompt = detectPrompt("Press Enter to continue");
  assert.equal(prompt?.kind, "enter");
  assert.equal(prompt.options[0].label, "Enter");
  assert.equal(prompt.options[0].value, "");
});

test("detects press return and any key", () => {
  assert.equal(detectPrompt("Press Return to continue")?.kind, "enter");
  assert.equal(detectPrompt("Press any key to continue")?.kind, "enter");
  assert.equal(detectPrompt("Hit enter")?.kind, "enter");
});

test("ignores free-text migration name", () => {
  assert.equal(detectPrompt("? Enter a name for the new migration: ›"), null);
  assert.equal(detectPrompt("Enter a name for the new migration:"), null);
});

test("ignores y/n mentioned mid-paragraph", () => {
  assert.equal(detectPrompt("You can answer y/n if you want to continue later."), null);
});

test("detects compact yes/no as confirm", () => {
  const prompt = detectPrompt("Overwrite existing file? yes/no");
  assert.equal(prompt?.kind, "confirm");
  assert.deepEqual(
    prompt.options.map((option) => option.value),
    ["y", "n"]
  );
});

test("detects inquirer pointer list", () => {
  const prompt = detectPrompt(`? Select a database (Use arrow keys)
❯ PostgreSQL
  MySQL
  SQLite`);
  assert.equal(prompt?.kind, "choice");
  assert.equal(prompt.question, "Select a database");
  assert.deepEqual(
    prompt.options.map((option) => option.value),
    ["PostgreSQL", "MySQL", "SQLite"]
  );
});

test("publicPrompt caps fields and drops empty", () => {
  assert.equal(publicPrompt(null), null);
  const pub = publicPrompt({
    kind: "confirm",
    question: "x".repeat(500),
    options: [{ id: "yes", label: "Yes", value: "y" }],
  });
  assert.equal(pub.question.length, 400);
  assert.equal(pub.options[0].value, "y");
  const enter = publicPrompt({
    kind: "enter",
    question: "Press Enter to continue",
    options: [{ id: "enter", label: "Enter", value: "" }],
  });
  assert.equal(enter.kind, "enter");
  assert.equal(enter.options[0].value, "");
});
