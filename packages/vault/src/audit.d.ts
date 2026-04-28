import type { AuditEvent, AuditLogger } from "./types.js";
export declare class FileAuditLogger implements AuditLogger {
    private filePath;
    private maxEntries;
    constructor(auditDir: string, maxEntries?: number);
    log(event: Omit<AuditEvent, "timestamp">): void;
    getEvents(filter?: {
        action?: string;
        provider?: string;
        since?: string;
    }): AuditEvent[];
    clear(): void;
}
export declare class NoopAuditLogger implements AuditLogger {
    log(): void;
    getEvents(): AuditEvent[];
    clear(): void;
}
