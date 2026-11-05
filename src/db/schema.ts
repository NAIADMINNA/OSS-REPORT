import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Users table linked to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Optional user entries relation table
export const entries = pgTable('entries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  content: text('content').notNull(),
  date: text('date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  entries: many(entries),
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  author: one(users, {
    fields: [entries.userId],
    references: [users.id],
  }),
}));

// DOE Daily Work Permit Reports table (stores active and soft-deleted reports in Cloud SQL PostgreSQL)
export const doeReports = pgTable('doe_reports', {
  id: text('id').primaryKey(),
  reportDate: text('report_date').notNull(),
  officeId: text('office_id').notNull(),
  officeName: text('office_name').notNull(),
  centerName: text('center_name').notNull(),
  region: text('region').notNull(),
  payload: jsonb('payload').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  updatedAt: text('updated_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// DOE Master Configuration & Reference Data table (offices, categories, queueMetrics, reporters, systemConfig, issues)
export const doeMasterState = pgTable('doe_master_state', {
  id: text('id').primaryKey(),
  payload: jsonb('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
