import fs from "node:fs";
import path from "node:path";
// ---------------------------------------------------------------------------
// File-based audit logger
// ---------------------------------------------------------------------------
export class FileAuditLogger {
    filePath;
    maxEntries;
    constructor(auditDir, maxEntries = 1000) {
        this.filePath = path.join(auditDir, "audit.jsonl");
        this.maxEntries = maxEntries;
    }
    log(event) {
        const fullEvent = {
            ...event,
            timestamp: new Date().toISOString(),
        };
        // Ensure the audit directory exists before writing
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
        fs.appendFileSync(this.filePath, JSON.stringify(fullEvent) + "\n", {
            encoding: "utf8",
        });
    }
    getEvents(filter) {
        if (!fs.existsSync(this.filePath))
            return [];
        const lines = fs
            .readFileSync(this.filePath, "utf8")
            .split("\n")
            .filter(Boolean);
        let events = lines.map((line) => JSON.parse(line));
        if (filter?.action)
            events = events.filter((e) => e.action === filter.action);
        if (filter?.provider)
            events = events.filter((e) => e.provider === filter.provider);
        if (filter?.since)
            events = events.filter((e) => e.timestamp >= filter.since);
        return events;
    }
    clear() {
        if (fs.existsSync(this.filePath))
            fs.unlinkSync(this.filePath);
    }
}
// ---------------------------------------------------------------------------
// No-op audit logger (used when auditing is disabled)
// ---------------------------------------------------------------------------
export class NoopAuditLogger {
    log() {
        /* no-op */
    }
    getEvents() {
        return [];
    }
    clear() {
        /* no-op */
    }
}
//# sourceMappingURL=audit.js.map