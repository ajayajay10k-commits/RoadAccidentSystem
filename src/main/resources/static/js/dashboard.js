const API = "https://roadaccidentsystem.onrender.com/api";
let currentPage = 0;
const pageSize = 10;
let searchTimer;
const charts = {};

const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.detail || data.message || data.error || "Request failed.");
    }
    return data;
}

function showMessage(message, error = false) {
    $("uploadNote").textContent = message;
    $("uploadNote").style.color = error ? "#ff8f9c" : "#54e2e9";
}

$("csvFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
        showMessage("Please select a CSV file.", true);
        event.target.value = "";
        return;
    }

    const button = document.querySelector(".upload-button");
    button.textContent = "Uploading...";
    button.style.pointerEvents = "none";
    showMessage("Reading and analyzing your CSV...");

    try {
        const form = new FormData();
        form.append("file", file);

        const result = await api(`${API}/upload`, {
            method: "POST",
            body: form
        });

        showMessage(`Successfully loaded ${result.totalAccidents} records.`);
        currentPage = 0;
        await loadDashboard();
    } catch (error) {
        showMessage(error.message || "Could not upload the CSV.", true);
    } finally {
        button.innerHTML = "? &nbsp; Upload accident CSV";
        button.style.pointerEvents = "";
        event.target.value = "";
    }
});

function updateStat(id, value) {
    $(id).textContent = Number(value || 0).toLocaleString();
}

function createChart(id, type, labels, values, colors, label) {
    const canvas = $(id);
    const empty = $(`${id.replace("Chart", "")}Empty`);

    if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
    }

    const hasData = labels.length > 0 && values.some(value => value > 0);
    canvas.style.display = hasData ? "block" : "none";

    if (empty) {
        empty.style.display = hasData ? "none" : "block";
    }

    if (!hasData || typeof Chart === "undefined") return;

    const isPie = type === "doughnut";

    charts[id] = new Chart(canvas, {
        type,
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                backgroundColor: colors,
                borderColor: "#111a2b",
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
                    ticks: { color: "#8e9db5", maxRotation: 35, minRotation: 0, font: { size: 9 } },
                    grid: { display: false },
                    border: { color: "#25334a" }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: "#8e9db5", precision: 0, font: { size: 9 } },
                    grid: { color: "#25334a" },
                    border: { display: false }
                }
            }
        }
    });
}

function chartColors(count) {
    const palette = [
        "#54e2e9", "#7898ff", "#b69aff", "#ffb86b",
        "#ff819b", "#64dba7", "#65aaff", "#e6d477"
    ];
    return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function renderChart(id, data, type, label) {
    const entries = Object.entries(data || {})
        .sort((a, b) => b[1] - a[1])
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

async function loadDashboard() {
    try {
        const data = await api(`${API}/summary`);

        updateStat("totalAccidents", data.totalAccidents);
        updateStat("severityTotal", Object.keys(data.severity || {}).length);
        updateStat("locationTotal", Object.keys(data.location || {}).length);
        updateStat("columnTotal", (data.columns || []).length);

        renderChart("severityChart", data.severity, "doughnut", "Accidents");
        renderChart("locationChart", data.location, "bar", "Accidents");
        renderChart("timeChart", data.time, "line", "Accidents");

        await loadRecords();
    } catch (error) {
        showMessage("Could not connect to the backend. Start RoadGuard first.", true);
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

async function loadRecords() {
    const query = $("searchInput").value.trim();
    const params = new URLSearchParams({
        search: query,
        page: String(currentPage),
        size: String(pageSize)
    });

    try {
        const data = await api(`${API}/records?${params}`);
        const table = $("recordsTable");
        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");
        const columns = data.columns || [];
        const records = data.records || [];

        thead.innerHTML = columns.length
            ? `<tr>${columns.map(column => `<th>${escapeHTML(column)}</th>`).join("")}</tr>`
            : "<tr><th>STATUS</th><th>DETAILS</th></tr>";

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="${Math.max(columns.length, 1)}" class="empty-cell">${columns.length ? "No matching records found." : "Upload a CSV file to see your records here."}</td></tr>`;
        } else {
            tbody.innerHTML = records.map(record =>
                `<tr>${columns.map(column =>
                    `<td>${escapeHTML(record[column])}</td>`
                ).join("")}</tr>`
            ).join("");
        }

        $("recordCount").textContent = `${Number(data.total).toLocaleString()} records`;
        const totalPages = Math.ceil(data.total / pageSize);
        $("pageInfo").textContent = data.total
            ? `Page ${currentPage + 1} of ${totalPages}`
            : "No records loaded";

        $("prevPage").disabled = currentPage <= 0;
        $("nextPage").disabled = currentPage + 1 >= totalPages;
    } catch (error) {
        $("recordsTable").querySelector("tbody").innerHTML =
            `<tr><td class="empty-cell">${escapeHTML(error.message)}</td></tr>`;
    }
}

$("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentPage = 0;
        loadRecords();
    }, 250);
});

$("prevPage").addEventListener("click", () => {
    if (currentPage > 0) {
        currentPage--;
        loadRecords();
    }
});

$("nextPage").addEventListener("click", () => {
    currentPage++;
    loadRecords();
});

$("refreshButton").addEventListener("click", () => {
    loadDashboard();
});

loadDashboard();


