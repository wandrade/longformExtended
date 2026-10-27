/**
 * Obsidian extends `Array` and `String` with `contains`. The unit tests run in
 * plain Node, so install the same minimal helpers for source modules that use
 * them (for example the indented tree's collapse checks).
 */
declare global {
  interface Array<T> {
    contains(item: T): boolean;
  }

  interface String {
    contains(text: string): boolean;
  }
}

if (!Array.prototype.contains) {
  Object.defineProperty(Array.prototype, "contains", {
    value: function contains<T>(this: T[], item: T): boolean {
      return this.indexOf(item) >= 0;
    },
    configurable: true,
    writable: true,
  });
}

if (!String.prototype.contains) {
  Object.defineProperty(String.prototype, "contains", {
    value: function contains(this: string, text: string): boolean {
      return this.indexOf(text) >= 0;
    },
    configurable: true,
    writable: true,
  });
}

export {};
