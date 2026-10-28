package com.roadguard;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api")
public class AccidentController {

    private final List<Map<String, String>> accidents = new ArrayList<>();
    private List<String> headers = new ArrayList<>();

    @PostMapping("/upload")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Please select a CSV file.");
        }

        if (file.getOriginalFilename() == null ||
            !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".csv")) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Please upload a CSV file.");
        }

        try (Reader reader = new InputStreamReader(
                    file.getInputStream(), StandardCharsets.UTF_8);
             CSVParser parser = CSVFormat.DEFAULT.builder()
                    .setHeader()
                    .setSkipHeaderRecord(true)
                    .setIgnoreEmptyLines(true)
                    .get()
                    .parse(reader)) {

            List<Map<String, String>> rows = new ArrayList<>();
            List<String> columns = new ArrayList<>(parser.getHeaderNames());

            if (columns.isEmpty()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "The CSV file has no header row.");
            }

            for (CSVRecord record : parser) {
                Map<String, String> row = new LinkedHashMap<>();
                for (String column : columns) {
                    row.put(column, record.isMapped(column)
                        ? record.get(column) : "");
                }
                rows.add(row);
            }

            synchronized (accidents) {
                headers = columns;
                accidents.clear();
                accidents.addAll(rows);
            }

            return summary();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Could not read the CSV. Check its headers and format.");
        }
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        synchronized (accidents) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("totalAccidents", accidents.size());
            result.put("columns", new ArrayList<>(headers));
            result.put("records", new ArrayList<>(accidents.subList(
                0, Math.min(10, accidents.size()))));
            result.put("loaded", !accidents.isEmpty());
            result.put("severity", countBy(findColumn(
                "severity", "accident_severity", "severity_level")));
            result.put("location", countBy(findColumn(
                "city", "location", "district", "area")));
            result.put("time", countBy(findColumn(
                "time", "accident_time", "hour")));
            result.put("message", accidents.isEmpty()
                ? "Upload a CSV file to begin analysis."
                : "Analysis is based on the uploaded records.");
            return result;
        }
    }

    @GetMapping("/records")
    public Map<String, Object> records(
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        synchronized (accidents) {
            int safePage = Math.max(0, page);
            int safeSize = Math.max(1, Math.min(size, 100));
            String query = search.toLowerCase(Locale.ROOT);

            List<Map<String, String>> filtered = accidents.stream()
                .filter(row -> row.values().stream()
                    .anyMatch(value -> value.toLowerCase(Locale.ROOT)
                        .contains(query)))
                .toList();

            int start = Math.min(safePage * safeSize, filtered.size());
            int end = Math.min(start + safeSize, filtered.size());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("records", filtered.subList(start, end));
            result.put("total", filtered.size());
            result.put("page", safePage);
            result.put("size", safeSize);
            result.put("columns", new ArrayList<>(headers));
            return result;
        }
    }

    private String findColumn(String... candidates) {
        for (String header : headers) {
            String normalized = header.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");
            for (String candidate : candidates) {
                if (normalized.equals(
                    candidate.toLowerCase(Locale.ROOT)
                        .replaceAll("[^a-z0-9]", ""))) {
                    return header;
                }
            }
        }
        return null;
    }

    private Map<String, Long> countBy(String column) {
        Map<String, Long> counts = new TreeMap<>();
        if (column == null) return counts;

        for (Map<String, String> row : accidents) {
            String value = row.getOrDefault(column, "").trim();
            if (!value.isEmpty()) {
                counts.merge(value, 1L, Long::sum);
            }
        }
        return counts;
    }
}
