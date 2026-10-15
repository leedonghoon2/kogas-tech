import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/types';

const NAV = [
  { to: '/', label: '대시보드', icon: '📊', end: true },
  { to: '/items', label: '재고 현황', icon: '📦' },
  { to: '/issue', label: '불출 등록', icon: '📤' },
  { to: '/receive', label: '입고 등록', icon: '📥' },
  { to: '/ledger', label: '불출대장 · 수불부', icon: '📒' },
  { to: '/usage', label: '사용량 통계', icon: '📈' },
];

const ADMIN_NAV = [
  { to: '/import', label: '재고 일괄등록', icon: '🗂️' },
  { to: '/users', label: '사용자 관리', icon: '👥' },
];

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="app">
      <header className="topbar no-print">
        <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="메뉴">
          ☰
        </button>
        <NavLink to="/" className="brand">
          <span className="brand-mark">⚠</span> 위험물 창고 재고관리
        </NavLink>
        <div className="topbar-user">
          <NavLink to="/profile" className="user-chip" title="내 정보">
            {profile?.full_name || profile?.email}
            {profile && <span className={`role role-${profile.role}`}>{ROLE_LABEL[profile.role]}</span>}
          </NavLink>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            로그아웃
          </button>
        </div>
      </header>

      <nav className={`sidebar no-print ${open ? 'open' : ''}`}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="nav-section">관리자</div>
            {ADMIN_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="nav-link">
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>
      {open && <div className="backdrop no-print" onClick={() => setOpen(false)} />}

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
