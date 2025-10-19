const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
const testsFile = path.join(dataDir, "tests.json");
const subsFile = path.join(dataDir, "submissions.json");

// Ensure data directory/files exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(testsFile)) fs.writeFileSync(testsFile, JSON.stringify({}));
if (!fs.existsSync(subsFile)) fs.writeFileSync(subsFile, JSON.stringify({}));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

// Create/Update test
app.post("/api/tests", (req, res) => {
    const { testId, title, duration, questions } = req.body;
    if (!testId || !title || !duration || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Invalid payload" });
    }
    const tests = readJSON(testsFile);
    tests[testId] = { testId, title, duration, questions };
    writeJSON(testsFile, tests);

    const subs = readJSON(subsFile);
    if (!subs[testId]) subs[testId] = [];
    writeJSON(subsFile, subs);

    res.json({ ok: true, testId });
});

// Get test by id
app.get("/api/tests/:id", (req, res) => {
    const tests = readJSON(testsFile);
    const t = tests[req.params.id];
    if (!t) return res.status(404).json({ error: "Test not found" });
    res.json(t);
});

// Submit answers (auto-grade MCQ/fill)
app.post("/api/tests/:id/submit", (req, res) => {
    const { studentName, studentId, answers, startedAt, submittedAt } = req.body;
    const tests = readJSON(testsFile);
    const test = tests[req.params.id];
    if (!test) return res.status(404).json({ error: "Test not found" });

    let score = 0;
    let maxAuto = 0;
    const results = test.questions.map((q, i) => {
        const ans = answers?.[i] ?? null;
        const item = { index: i, type: q.type, marks: q.marks, response: ans, correct: null, awarded: 0 };

        if (q.type === "mcq") {
            maxAuto += q.marks;
            const correct = (ans ?? "") === q.answer; // answer is the exact option string
            item.correct = correct;
            item.awarded = correct ? q.marks : 0;
        } else if (q.type === "fill") {
            maxAuto += q.marks;
            const norm = s => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, "");
            const correct = norm(ans) === norm(q.answer);
            item.correct = correct;
            item.awarded = correct ? q.marks : 0;
        } else if (q.type === "long") {
            item.correct = null; // manual grading later
            item.awarded = 0;
        }
        score += item.awarded;
        return item;
    });

    const subs = readJSON(subsFile);
    const record = {
        studentName,
        studentId,
        testId: req.params.id,
        score,
        maxAuto,
        startedAt,
        submittedAt,
        answers,
        results
    };
    subs[req.params.id].push(record);
    writeJSON(subsFile, subs);

    res.json({ ok: true, score, maxAuto, results });
});

// List submissions for a test
app.get("/api/tests/:id/submissions", (req, res) => {
    const subs = readJSON(subsFile);
    res.json(subs[req.params.id] || []);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
document.getElementById("viewTestsBtn").addEventListener("click", async () => {
    const savedTestsDiv = document.getElementById("savedTests");
    const testsList = document.getElementById("testsList");
    testsList.innerHTML = "";

    const snapshot = await db.collection("tests").get();
    if (snapshot.empty) {
        testsList.innerHTML = "<li>No tests found.</li>";
    } else {
        snapshot.forEach(doc => {
            const t = doc.data();
            const li = document.createElement("li");
            li.innerHTML = `
        <strong>${t.title}</strong> (${t.duration} min) 
        — ID: <code>${doc.id}</code> 
        — ${t.published ? "✅ Published" : "❌ Not Published"}
        <button class="btn" onclick="loadTest('${doc.id}')">Load</button>
      `;
            testsList.appendChild(li);
        });
    }
    savedTestsDiv.style.display = "block";
});

// Function to load a test back into the dashboard
window.loadTest = async function (testId) {
    const docSnap = await db.collection("tests").doc(testId).get();
    if (!docSnap.exists) {
        alert("Test not found");
        return;
    }
    const test = docSnap.data();
    document.getElementById("title").value = test.title;
    document.getElementById("duration").value = test.duration;
    questions = test.questions || [];
    renderQuestions();
    currentTestId = testId;
    document.getElementById("testId").textContent = testId;
    document.getElementById("status").textContent = "Loaded saved test.";
};