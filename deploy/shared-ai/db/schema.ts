import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const reviewRequests=sqliteTable('review_requests',{
 id:text('id').primaryKey(),session:text('session').notNull(),clientHash:text('client_hash').notNull(),fingerprint:text('fingerprint').notNull(),createdAt:integer('created_at').notNull(),finishedAt:integer('finished_at'),outcome:text('outcome'),inputTokens:integer('input_tokens'),outputTokens:integer('output_tokens'),totalTokens:integer('total_tokens'),
},table=>[index('review_requests_session_time').on(table.session,table.createdAt),index('review_requests_client_time').on(table.session,table.clientHash,table.createdAt),index('review_requests_fingerprint').on(table.session,table.fingerprint,table.createdAt)]);
export const reviewCache=sqliteTable('review_cache',{key:text('key').primaryKey(),payload:text('payload').notNull(),expiresAt:integer('expires_at').notNull()});
