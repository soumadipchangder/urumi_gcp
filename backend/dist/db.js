"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dbPath = path_1.default.join(__dirname, '..', 'data', 'stores.db');
fs_1.default.mkdirSync(path_1.default.dirname(dbPath), { recursive: true });
exports.db = new better_sqlite3_1.default(dbPath);
exports.db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    engine TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT,
    error TEXT,
    createdAt TEXT NOT NULL
  );
`);
