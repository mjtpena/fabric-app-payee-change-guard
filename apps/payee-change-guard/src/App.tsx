import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { CallbackPage } from './pages/CallbackPage';
import { CanalPage } from './pages/CanalPage';
import { HarbourPage } from './pages/HarbourPage';
import { KeeperPage } from './pages/KeeperPage';
import { LedgerPage, SupplierLedgerPage } from './pages/LedgerPage';
import { SecondKeyPage } from './pages/SecondKeyPage';
import { VoyagePage } from './pages/VoyagePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><CanalPage /></AppShell>} />
      <Route path="/keeper" element={<AppShell wide><KeeperPage /></AppShell>} />
      <Route path="/callback" element={<AppShell wide><CallbackPage /></AppShell>} />
      <Route path="/callback/:id" element={<AppShell wide><CallbackPage /></AppShell>} />
      <Route path="/second-key" element={<AppShell wide><SecondKeyPage /></AppShell>} />
      <Route path="/second-key/:id" element={<AppShell wide><SecondKeyPage /></AppShell>} />
      <Route path="/requests/:id" element={<AppShell wide><VoyagePage /></AppShell>} />
      <Route path="/ledger" element={<AppShell wide><LedgerPage /></AppShell>} />
      <Route path="/ledger/:id" element={<AppShell wide><SupplierLedgerPage /></AppShell>} />
      <Route path="/harbour" element={<AppShell wide><HarbourPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
