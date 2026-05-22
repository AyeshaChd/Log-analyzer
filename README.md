# Log Analyzer

This project analyzes server log files and generates a summary report.

It can handle:
- Different timestamp formats
- Missing fields
- JSON log lines
- Malformed log entries
- Stack traces

The analyzer shows results in the terminal and also creates an HTML report.

---

# Requirements

- Node.js version 16 or above installed on your machine

Check Node.js version:

```bash
node -v
```

---

# Run the Project

## Basic Command

```bash
node bin/analyze.js <log-file>
```

## Example

```bash
node bin/analyze.js test_logs.log
```

This will:
- Read and analyze the log file
- Show results in the terminal
- Generate a `report.html` file

---

📊 View HTML Report

After running the analyzer, a file called report.html is created in your project folder.

To view the report:

Go to your project folder
Find report.html
Double-click it to open in a browser (Chrome recommended)


# Generate Sample Logs

You can also generate sample logs for testing.

## Example

```bash
node scripts/generate_logs.js test_logs.log 100
```

This creates a log file with:
- Normal HTTP requests
- Different timestamp formats
- Missing status codes
- JSON log entries
- Invalid lines
- Stack traces

---

# Run Tests

Run the parser tests using:

```bash
node scripts/test_parser.js
```

If everything works correctly, you will see:

```text
✔ PASS
```

---

# Project Structure

```text
├── bin/
│   └── analyze.js         # Main CLI file
├── src/
│   ├── parser.js          # Log parsing logic
│   └── reporter.js        # Terminal and HTML report output
├── scripts/
│   ├── generate_logs.js   # Creates sample logs
│   └── test_parser.js     # Parser tests
├── package.json
├── README.md
└── ANSWERS.md
```

