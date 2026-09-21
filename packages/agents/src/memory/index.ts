export interface MemoryEntry {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: number;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  add(entry: MemoryEntry): void;
  getRecent(n?: number): MemoryEntry[];
  getAll(): MemoryEntry[];
  clear(): void;
  totalTokens(): number;
}

export class InMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];
  private maxTokens: number;

  constructor(maxTokens = 8000) {
    this.maxTokens = maxTokens;
  }

  add(entry: MemoryEntry): void {
    this.entries.push(entry);
    this.evictIfNeeded();
  }

  getRecent(n = 20): MemoryEntry[] {
    return this.entries.slice(-n);
  }

  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  totalTokens(): number {
    return this.entries.reduce((sum, e) => sum + (e.tokens ?? 0), 0);
  }

  private evictIfNeeded(): void {
    while (this.totalTokens() > this.maxTokens && this.entries.length > 1) {
      // Always keep the first system message
      const systemIdx = this.entries.findIndex((e) => e.role === "system");
      if (systemIdx === 0 && this.entries.length > 1) {
        this.entries.splice(1, 1);
      } else {
        this.entries.shift();
      }
    }
  }
}

export class SlidingWindowMemory implements MemoryStore {
  private entries: MemoryEntry[] = [];
  private windowSize: number;

  constructor(windowSize = 50) {
    this.windowSize = windowSize;
  }

  add(entry: MemoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.windowSize) {
      this.entries.shift();
    }
  }

  getRecent(n = 20): MemoryEntry[] {
    return this.entries.slice(-Math.min(n, this.windowSize));
  }

  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  totalTokens(): number {
    return this.entries.reduce((sum, e) => sum + (e.tokens ?? 0), 0);
  }
}
