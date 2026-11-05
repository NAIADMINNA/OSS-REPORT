import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { requireAuth, optionalAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getUsers, getOrCreateUser } from './src/db/users.ts';
import {
  getAllReportsFromSql,
  upsertReportInSql,
  upsertBulkReportsInSql,
  softDeleteReportInSql,
  hardDeleteReportInSql,
  clearAllActiveReportsInSql,
  restoreAllTrashReportsInSql,
  getMasterStateFromSql,
  upsertMasterStateInSql,
} from './src/db/doeRepository.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Authenticated user endpoints (Firebase Auth + Cloud SQL)
  app.get('/api/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user?.uid && req.user?.email) {
        await getOrCreateUser(req.user.uid, req.user.email);
      }
      const usersList = await getUsers();
      res.json(usersList);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch users';
      res.status(500).json({ error: msg });
    }
  });

  // DOE Cloud SQL State Endpoint (fetches activeReports, deletedReports, and masterConfig sequentially)
  app.get('/api/doe/state', optionalAuth, async (_req: AuthRequest, res) => {
    try {
      const { activeReports, deletedReports } = await getAllReportsFromSql();
      const masterConfig = await getMasterStateFromSql();
      res.json({
        activeReports,
        deletedReports,
        masterConfig,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch DOE state';
      res.status(500).json({ error: msg });
    }
  });

  // Save or update a single DOE Report in Cloud SQL
  app.post('/api/doe/reports', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const report = req.body?.report;
      if (!report || !report.id) {
        return res.status(400).json({ error: 'Invalid report payload' });
      }
      const saved = await upsertReportInSql(report, false);
      res.json({ report: saved });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save report';
      res.status(500).json({ error: msg });
    }
  });

  // Bulk upsert DOE Reports in Cloud SQL
  app.post('/api/doe/reports/bulk', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const reports = req.body?.reports;
      const restoreDeleted = Boolean(req.body?.restoreDeleted);
      if (!Array.isArray(reports)) {
        return res.status(400).json({ error: 'Invalid reports array' });
      }
      const activeReports = await upsertBulkReportsInSql(reports, restoreDeleted);
      res.json({ activeReports });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to bulk save reports';
      res.status(500).json({ error: msg });
    }
  });

  // Soft-delete a DOE Report (move to trash) in Cloud SQL
  app.post('/api/doe/reports/delete', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const report = req.body?.report;
      if (!report || !report.id) {
        return res.status(400).json({ error: 'Invalid report payload' });
      }
      await softDeleteReportInSql(report);
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete report';
      res.status(500).json({ error: msg });
    }
  });

  // Hard-delete a DOE Report in Cloud SQL
  app.post('/api/doe/reports/purge', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const reportId = req.body?.reportId;
      if (!reportId) {
        return res.status(400).json({ error: 'Invalid reportId' });
      }
      await hardDeleteReportInSql(String(reportId));
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to purge report';
      res.status(500).json({ error: msg });
    }
  });

  // Restore a soft-deleted DOE Report in Cloud SQL
  app.post('/api/doe/reports/restore', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const report = req.body?.report;
      if (!report || !report.id) {
        return res.status(400).json({ error: 'Invalid report payload' });
      }
      const restored = await upsertReportInSql(report, false);
      res.json({ report: restored });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to restore report';
      res.status(500).json({ error: msg });
    }
  });

  // Restore all trash reports in Cloud SQL
  app.post('/api/doe/reports/restore-all-trash', optionalAuth, async (_req: AuthRequest, res) => {
    try {
      const activeReports = await restoreAllTrashReportsInSql();
      res.json({ activeReports });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to restore trash reports';
      res.status(500).json({ error: msg });
    }
  });

  // Clear all active reports (soft-delete to trash) in Cloud SQL
  app.post('/api/doe/reports/clear-all', optionalAuth, async (_req: AuthRequest, res) => {
    try {
      await clearAllActiveReportsInSql();
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to clear reports';
      res.status(500).json({ error: msg });
    }
  });

  // Update Master Configuration & Reference Data in Cloud SQL
  app.post('/api/doe/master-config', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const configUpdate = req.body?.config;
      if (!configUpdate || typeof configUpdate !== 'object') {
        return res.status(400).json({ error: 'Invalid config payload' });
      }
      const merged = await upsertMasterStateInSql(configUpdate);
      res.json({ masterConfig: merged });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update master config';
      res.status(500).json({ error: msg });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (Boolean(process.env.K_SERVICE) && fs.existsSync(path.join(distPath, 'index.html')));

  if (!isProduction) {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
