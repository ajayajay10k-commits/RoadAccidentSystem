
const API = "https://roadaccidentsystem.onrender.com/api";

let currentPage = 0;
const pageSize = 10;
let searchTimer;
const charts = {};

const WEATHER_TYPES = ["Rain", "Cloudy", "Clear", "Dust Storm"];

const WEATHER_COLORS = {
    Rain: "#7898ff",
    Cloudy: "#b69aff",
    Clear: "#54e2e9",
    "Dust Storm": "#ffb86b"
};

const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.detail || data.message || data.error || "Request failed."
        );
    }

    return data;
}

function showMessage(message, error = false) {
    const note = $("uploadNote");

    if (!note) return;

    note.textContent = message;
    note.style.color = error ? "#ff8f9c" : "#54e2e9";
}

function updateStat(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = Number(value || 0).toLocaleString();
    }
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function normalize(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function normalizeWeather(value) {
    const weather = normalize(value);

    if (weather.includes("duststorm")) return "Dust Storm";
    if (weather.includes("rain")) return "Rain";
    if (weather.includes("cloud")) return "Cloudy";
    if (weather.includes("clear")) return "Clear";

    return null;
}

function chartColors(count) {
    const palette = [
        "#54e2e9", "#7898ff", "#b69aff", "#ffb86b",
        "#ff819b", "#64dba7", "#65aaff", "#e6d477"
    ];

    return Array.from(
        { length: count },
        (_, index) => palette[index % palette.length]
    );
}

function createChart(id, type, labels, values, colors, label) {
    const canvas = $(id);

    if (!canvas || typeof Chart === "undefined") return;

    const empty = $(`${id.replace("Chart", "")}Empty`);

    if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
    }

    const hasData = labels.length > 0 &&
        values.some(value => Number(value) > 0);

    canvas.style.display = hasData ? "block" : "none";

    if (empty) {
        empty.style.display = hasData ? "none" : "block";
    }

    if (!hasData) return;

    const isPie = type === "doughnut" || type === "pie";

    charts[id] = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                backgroundColor: colors,
                borderColor: isPie ? "#111a2b" : colors,
                borderWidth: isPie ? 3 : 0,
                borderRadius: isPie ? 0 : 5,
                hoverOffset: isPie ? 7 : 0,
                maxBarThickness: 38
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: isPie,
                    position: "bottom",
                    labels: {
                        color: "#a9b8cf",
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: "circle",
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    backgroundColor: "#18253a",
                    titleColor: "#edf3ff",
                    bodyColor: "#b9c9df",
                    padding: 12
                }
            },
            scales: isPie ? {} : {
                x: {
                    ticks: {
                        color: "#8e9db5",
                        maxRotation: 35,
                        minRotation: 0,
                        font: { size: 9 }
                    },
                    grid: { display: false },
                    border: { color: "#25334a" }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#8e9db5",
                        precision: 0,
                        font: { size: 9 }
                    },
                    grid: { color: "#25334a" },
                    border: { display: false }
                }
            }
        }
    });
}

function renderChart(id, data, type, label) {
    const entries = Object.entries(data || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 10);

    createChart(
        id,
        type,
        entries.map(entry => entry[0]),
        entries.map(entry => Number(entry[1])),
        chartColors(entries.length),
        label
    );
}

/* ---------------- CSV UPLOAD ---------------- */

const csvFile = $("csvFile");

if (csvFile) {
    csvFile.addEventListener("change", async event => {
        const file = event.target.files[0];

        if (!file) return;

        if (!file.name.toLowerCase().endsWith(".csv")) {
            showMessage("Please select a CSV file.", true);
            event.target.value = "";
            return;
        }

        const button = document.querySelector(".upload-button");

        if (button) {
            button.textContent = "Uploading...";
            button.style.pointerEvents = "none";
        }

        showMessage("Reading and analyzing your CSV...");

        try {
            const form = new FormData();
            form.append("file", file);

            const result = await api(`${API}/upload`, {
                method: "POST",
                body: form
            });

            showMessage(
                `Successfully loaded ${Number(
                    result.totalAccidents || 0
                ).toLocaleString()} records.`
            );

            currentPage = 0;
            await loadDashboard();
        } catch (error) {
            showMessage(
                error.message || "Could not upload the CSV.",
                true
            );
        } finally {
            if (button) {
                button.innerHTML = "? &nbsp; Upload accident CSV";
                button.style.pointerEvents = "";
            }

            event.target.value = "";
        }
    });
}

/* ---------------- OVERVIEW ---------------- */

async function loadDashboard() {
    try {
        const data = await api(`${API}/summary`);

        updateStat("totalAccidents", data.totalAccidents);
        updateStat(
            "severityTotal",
            Object.keys(data.severity || {}).length
        );
        updateStat(
            "locationTotal",
            Object.keys(data.location || {}).length
        );
        updateStat("columnTotal", (data.columns || []).length);

        renderChart(
            "severityChart",
            data.severity,
            "doughnut",
            "Accidents"
        );

        renderChart(
            "locationChart",
            data.location,
            "bar",
            "Accidents"
        );

        renderChart(
            "timeChart",
            data.time,
            "line",
            "Accidents"
        );

        await loadWeatherAnalysis(data);
        await loadRecords();
    } catch (error) {
        showMessage(
            "Could not connect to the backend. Please check the server.",
            true
        );
    }
}

/* ---------------- WEATHER ANALYSIS ---------------- */

function getWeatherCounts(summary) {
    const source = summary.weather || {};
    const counts = {};

    WEATHER_TYPES.forEach(type => {
        const match = Object.keys(source).find(
            key => normalizeWeather(key) === type
        );

        counts[type] = match ? Number(source[match] || 0) : 0;
    });

    return counts;
}

function updateWeatherCards(counts, total) {
    const ids = {
        Rain: ["rainCount", "rainPercent"],
        Cloudy: ["cloudyCount", "cloudyPercent"],
        Clear: ["clearCount", "clearPercent"],
        "Dust Storm": ["dustCount", "dustPercent"]
    };

    WEATHER_TYPES.forEach(type => {
        const count = counts[type] || 0;
        const percent = total > 0 ? count / total * 100 : 0;
        const [countId, percentId] = ids[type];

        updateStat(countId, count);
        setText(percentId, `${percent.toFixed(1)}%`);

        // Support alternative percentage IDs if used in the HTML.
        const alternateId = {
            Rain: "rainPercentage",
            Cloudy: "cloudyPercentage",
            Clear: "clearPercentage",
            "Dust Storm": "dustPercentage"
        }[type];

        if ($(alternateId)) {
            setText(alternateId, `${percent.toFixed(1)}%`);
        }
    });
}

function renderWeatherCharts(counts, total, weatherSeverity) {
    const labels = WEATHER_TYPES;
    const values = labels.map(type => counts[type] || 0);
    const colors = labels.map(type => WEATHER_COLORS[type]);

    createChart(
        "weatherChart",
        "doughnut",
        labels,
        values,
        colors,
        "Accidents by Weather"
    );

    const percentages = values.map(value =>
        total > 0 ? Number((value / total * 100).toFixed(2)) : 0
    );

    createChart(
        "weatherPercentChart",
        "bar",
        labels,
        percentages,
        colors,
        "Percentage of Accidents"
    );

    renderWeatherSeverityChart(weatherSeverity);
}

function renderWeatherSeverityChart(weatherSeverity) {
    const canvas = $("weatherSeverityChart");

    if (!canvas || typeof Chart === "undefined") return;

    const id = "weatherSeverityChart";

    if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
    }

    const severityNames = new Set();

    WEATHER_TYPES.forEach(weather => {
        Object.keys((weatherSeverity || {})[weather] || {})
            .forEach(severity => severityNames.add(severity));
    });

    const severityLabels = Array.from(severityNames);

    const hasData = severityLabels.length > 0 &&
        WEATHER_TYPES.some(weather =>
            Object.values(
                (weatherSeverity || {})[weather] || {}
            ).some(value => Number(value) > 0)
        );

    const empty = $("weatherSeverityEmpty");

    canvas.style.display = hasData ? "block" : "none";

    if (empty) {
        empty.style.display = hasData ? "none" : "block";
    }

    if (!hasData) return;

    const severityColors = chartColors(severityLabels.length);

    charts[id] = new Chart(canvas, {
        type: "bar",
        data: {
            labels: WEATHER_TYPES,
            datasets: severityLabels.map((severity, index) => ({
                label: severity,
                data: WEATHER_TYPES.map(weather =>
                    Number(
                        ((weatherSeverity || {})[weather] || {})[severity] || 0
                    )
                ),
                backgroundColor: severityColors[index],
                borderRadius: 4,
                maxBarThickness: 32
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: "bottom",
                    labels: {
                        color: "#a9b8cf",
                        usePointStyle: true,
                        padding: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    backgroundColor: "#18253a",
                    titleColor: "#edf3ff",
                    bodyColor: "#b9c9df"
                }
            },
            scales: {
                x: {
                    ticks: { color: "#8e9db5", font: { size: 9 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#8e9db5",
                        precision: 0
                    },
                    grid: { color: "#25334a" }
                }
            }
        }
    });
}

function renderWeatherInsights(counts, total, weatherColumn) {
    const container = $("weatherInsights");

    if (!container) return;

    if (!weatherColumn) {
        container.textContent =
            "No weather column was detected in the uploaded CSV. " +
            "Use a column such as Weather, Weather Condition, or Weather Conditions.";
        return;
    }

    if (total === 0) {
        container.textContent = "Upload a CSV file to see weather insights.";
        return;
    }

    const ranked = WEATHER_TYPES
        .map(type => ({ type, count: counts[type] || 0 }))
        .sort((a, b) => b.count - a.count);

    const recognizedTotal = ranked.reduce(
        (sum, item) => sum + item.count, 0
    );

    if (recognizedTotal === 0) {
        container.textContent =
            `Weather column "${weatherColumn}" was found, but no values ` +
            "matched Rain, Cloudy, Clear, or Dust Storm.";
        return;
    }

    const mostCommon = ranked[0];
    const leastCommon = ranked[ranked.length - 1];
    const percentage = (mostCommon.count / recognizedTotal) * 100;

    container.innerHTML = `
        <p>
            <strong>${escapeHTML(mostCommon.type)}</strong> is the most
            frequent of the four tracked weather categories, with
            ${mostCommon.count.toLocaleString()} records
            (${percentage.toFixed(1)}% of categorized records).
        </p>
        <p>
            <strong>${escapeHTML(leastCommon.type)}</strong> has
            ${leastCommon.count.toLocaleString()} records.
        </p>
        <p>
            ${recognizedTotal.toLocaleString()} of
            ${Number(total).toLocaleString()} total accident records
            match the four tracked weather categories.
        </p>
    `;
}

async function loadWeatherAnalysis(summary) {
    const counts = getWeatherCounts(summary);
    const total = Number(summary.totalAccidents || 0);

    updateWeatherCards(counts, total);

    renderWeatherCharts(
        counts,
        total,
        summary.weatherSeverity || {}
    );

    renderWeatherInsights(
        counts,
        total,
        summary.weatherColumn
    );

    await loadWeatherRecords(summary);
}

/* ---------------- WEATHER RECORDS TABLE ---------------- */

async function loadWeatherRecords(summary) {
    const table = $("weatherRecordsTable");

    if (!table) return;

    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    if (!tbody) return;

    try {
        const data = await api(
            `${API}/records?page=0&size=100`
        );

        const columns = data.columns || [];
        const records = data.records || [];
        const weatherColumn = summary.weatherColumn;

        if (thead) {
            thead.innerHTML = columns.length
                ? `<tr>${columns.map(column =>
                    `<th>${escapeHTML(column)}</th>`
                  ).join("")}</tr>`
                : "<tr><th>STATUS</th></tr>";
        }

        if (!weatherColumn) {
            tbody.innerHTML = `
                <tr>
                    <td class="empty-cell">
                        No weather column was detected in this CSV.
                    </td>
                </tr>
            `;
            return;
        }

        const weatherRecords = records.filter(record =>
            normalizeWeather(record[weatherColumn]) !== null
        );

        if (!weatherRecords.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${Math.max(columns.length, 1)}"
                        class="empty-cell">
                        No matching weather records in the first 100 records.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = weatherRecords.map(record =>
            `<tr>${columns.map(column =>
                `<td>${escapeHTML(record[column])}</td>`
            ).join("")}</tr>`
        ).join("");
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td class="empty-cell">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    }
}

/* ---------------- ALL ACCIDENT RECORDS ---------------- */

async function loadRecords() {
    const searchInput = $("searchInput");
    const table = $("recordsTable");

    if (!searchInput || !table) return;

    const query = searchInput.value.trim();

    const params = new URLSearchParams({
        search: query,
        page: String(currentPage),
        size: String(pageSize)
    });

    try {
        const data = await api(`${API}/records?${params}`);

        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");
        const columns = data.columns || [];
        const records = data.records || [];

        if (!tbody) return;

        if (thead) {
            thead.innerHTML = columns.length
                ? `<tr>${columns.map(column =>
                    `<th>${escapeHTML(column)}</th>`
                  ).join("")}</tr>`
                : "<tr><th>STATUS</th><th>DETAILS</th></tr>";
        }

        if (!records.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${Math.max(columns.length, 1)}"
                        class="empty-cell">
                        ${columns.length
                            ? "No matching records found."
                            : "Upload a CSV file to see your records here."}
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = records.map(record =>
                `<tr>${columns.map(column =>
                    `<td>${escapeHTML(record[column])}</td>`
                ).join("")}</tr>`
            ).join("");
        }

        setText(
            "recordCount",
            `${Number(data.total || 0).toLocaleString()} records`
        );

        const totalPages = Math.ceil(
            Number(data.total || 0) / pageSize
        );

        setText(
            "pageInfo",
            data.total
                ? `Page ${currentPage + 1} of ${totalPages}`
                : "No records loaded"
        );

        const previous = $("prevPage");
        const next = $("nextPage");

        if (previous) previous.disabled = currentPage <= 0;

        if (next) {
            next.disabled = currentPage + 1 >= totalPages;
        }
    } catch (error) {
        const tbody = table.querySelector("tbody");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td class="empty-cell">
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }
    }
}

/* ---------------- SEARCH, PAGINATION, REFRESH ---------------- */

if ($("searchInput")) {
    $("searchInput").addEventListener("input", () => {
        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            currentPage = 0;
            loadRecords();
        }, 250);
    });
}

if ($("prevPage")) {
    $("prevPage").addEventListener("click", () => {
        if (currentPage > 0) {
            currentPage--;
            loadRecords();
        }
    });
}

if ($("nextPage")) {
    $("nextPage").addEventListener("click", () => {
        currentPage++;
        loadRecords();
    });
}

if ($("refreshButton")) {
    $("refreshButton").addEventListener("click", () => {
        loadDashboard();
    });
}

/* ---------------- PAGE NAVIGATION ---------------- */

function setupPageNavigation() {
    const links = document.querySelectorAll(
        '[data-page], .sidebar a[href^="#"]'
    );

    const overviewPage = $("overviewPage");
    const weatherPage = $("weatherPage");

    function showPage(pageName) {
        if (overviewPage) {
            overviewPage.hidden = pageName !== "overview";
        }

        if (weatherPage) {
            weatherPage.hidden = pageName !== "weather";
        }

        const title = $("pageTitle") || $("topbarTitle");

        if (title) {
            title.textContent = pageName === "weather"
                ? "Weather Analysis"
                : "Accident Overview";
        }
    }

    links.forEach(link => {
        link.addEventListener("click", () => {
            const href = link.getAttribute("href") || "";
            const pageName = link.dataset.page ||
                href.replace(/^#/, "");

            if (pageName === "weather" ||
                pageName === "weatherPage") {
                showPage("weather");
            } else if (
                pageName === "overview" ||
                pageName === "overviewPage" ||
                pageName === ""
            ) {
                showPage("overview");
            }
        });
    });

    function handleHash() {
        const pageName = location.hash.replace(/^#/, "");

        if (pageName === "weather" || pageName === "weatherPage") {
            showPage("weather");
        } else {
            showPage("overview");
        }
    }

    window.addEventListener("hashchange", handleHash);
    handleHash();
}

/* ---------------- START ---------------- */

setupPageNavigation();
loadDashboard();
