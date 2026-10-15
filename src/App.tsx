import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import Issue from './pages/Issue';
import ItemDetail from './pages/ItemDetail';
import Items from './pages/Items';
import Ledger from './pages/Ledger';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Profile from './pages/Profile';
import Receive from './pages/Receive';
import SetupNotice from './pages/SetupNotice';
import Usage from './pages/Usage';
import Users from './pages/Users';

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { session, profile, loading, recovery } = useAuth();

  if (!isConfigured) return <SetupNotice />;
  if (loading) return <div className="splash">불러오는 중…</div>;
  if (!session) return <Login />;
  if (!profile || profile.role === 'pending') {
    return recovery ? <Profile /> : <Pending />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={recovery ? <Navigate to="/profile" replace /> : <Dashboard />} />
        <Route path="items" element={<Items />} />
        <Route path="items/:id" element={<ItemDetail />} />
        <Route path="issue" element={<Issue />} />
        <Route path="receive" element={<Receive />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="usage" element={<Usage />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="import"
          element={
            <AdminOnly>
              <Import />
            </AdminOnly>
          }
        />
        <Route
          path="users"
          element={
            <AdminOnly>
              <Users />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
