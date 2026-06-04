export type ColumnType = 'text' | 'number' | 'select' | 'boolean' | 'date' | 'file';

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[]; // Used if type is 'select'
  varcharLength?: number; // Custom varchar length (mostly for select / varchar types)
}

export interface Row {
  id: string;
  [key: string]: any;
}

export interface TableSchema {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SCHEMA_CHANGE';
  tableId: string;
  tableName: string;
  details: string;
}

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  password?: string; // Optative: keep it simple for local verification
  role: 'admin' | 'user';
  permissions: 'read-write' | 'read-only';
  allowedTables?: string[]; // Table IDs the user is permitted to view. Empty or empty list with "*" means all tables.
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  creator: string;
  tables: TableSchema[];
  affectedTables?: string[]; // Array of table IDs affected/backed up in selective snaps
}

export interface ScheduledSnapshot {
  id: string;
  name: string;
  frequency: 'hourly' | 'daily' | 'weekly';
  affectedTables: string[]; // ["*"] or specific table IDs
  active: boolean;
  lastRun?: string;
  nextRun?: string;
  creator: string;
}

export interface DbState {
  tables: TableSchema[];
  logs: AuditLog[];
  users?: UserAccount[];
  snapshots?: Snapshot[];
  scheduledSnapshots?: ScheduledSnapshot[];
}
