## 1. How to Run

### Requirements

* Install Node.js (version 16 or above)
* No extra packages are needed

Check Node version:

```bash
node -v
```

### Generate Test Logs

Run this command to generate sample logs:

```bash
node scripts/generate_logs.js test_logs.log 100
```

This creates a log file with normal logs and some malformed/anomalous lines.

### Run the Analyzer

```bash
node bin/analyze.js test_logs.log
```

This will:

* Analyze the log file
* Show a summary in the terminal
* Generate an HTML report named `report.html`
📊 View HTML Report

After running the analyzer, a file called report.html is created in your project folder.

To view the report:

Go to your project folder
Find report.html
Double-click it to open in a browser (Chrome recommended)

Custom output file:

```bash
node bin/analyze.js test_logs.log -o custom_report.html
```

### Run Tests

```bash
node scripts/test_parser.js
```

---

## 2. Stack Choice

I used Node.js with ES Modules because it is simple and good for handling large files using streams.

Instead of loading the whole file into memory, I used `fs.createReadStream` and `readline` to process logs line by line. This helps the program work even with very large log files.

I also used only built-in Node.js modules, so the project can run without installing dependencies.

A worse choice would be reading the entire file into memory using something like `fs.readFileSync()`. That could become slow or crash for large log files.

Using something heavy like Java Spring Boot would also be unnecessary for a small CLI utility.

---

## 3. One Real Edge Case

### Edge Case: Time Being Detected as an IPv6 Address

**File:** `src/parser.js`, **Line 9** (the `IP_REGEX` constant)

One issue happened while parsing timestamps like:

```text
15-Mar-2024 14:23:01 192.168.1.42 GET /api/users - 0.142s
```

The parser incorrectly detected `14:23:01` as an IPv6 address because IPv6 addresses also use colons.

Without handling this properly:

* The IP would become `14:23:01`
* The actual timestamp parsing would fail
* The line could be marked as malformed

To fix this, I updated the IPv6 regex so it only accepts:

* addresses with at least 3 colons
* or addresses containing `::`

This prevents normal time values from being matched as IPv6 addresses.

---

## 4. ChatGPT Usage

I used ChatGPT in a few places during development:

1. I used chatgpt to resolve syntax errors for parser structure 
but i did logic building by myself
2. To create the sample log generator script
3. I created th UI myself


One thing I changed from the AI-generated code was the IPv6 regex handling.

The original regex treated time values like `14:23:01` as IPv6 addresses. After testing, I noticed incorrect parsing results, so I updated the regex logic to avoid matching normal timestamps.

This showed me that AI can help speed up development, but testing and debugging are still important.

---

## 5. Honest Gap

One weak part of my solution is how stack traces are handled.

Right now, I simply attach stack trace lines to the previous log entry if they come directly after it.

This works in simple cases, but it is not always correct. In real systems, logs from different requests can get mixed together, so a stack trace might not actually belong to the previous line.

If I had more time, I would improve this by using a better way to group logs instead of only relying on line order. For example, I would try to use extra information like timestamps or request IDs if they are available in the logs.
