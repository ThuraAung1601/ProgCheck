import { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar.js';
import ClassroomPage from './ClassroomPage.js';
import DashboardPageContent from './DashboardPageContent.js';
import SettingsPage from './SettingsPage.js';
import AssignmentPage from './AssignmentPage.js';

const VALID_PAGES = ['classroom', 'dashboard', 'code', 'settings'];

function pageFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // path is /dashboard/<page>
  if (parts[0] === 'dashboard' && parts[1] && VALID_PAGES.includes(parts[1])) {
    return parts[1];
  }
  return 'classroom';
}

const Dashboard = ({ user, role, onLogout, onUserUpdate, mainContent, sidebarCollapsed, onSidebarChange }) => {
  const [activePage, setActivePage] = useState(pageFromPath);
  const [assignmentData, setAssignmentData] = useState(null);
  const sidebarWidth = sidebarCollapsed ? '80px' : 'var(--sidebar-w)';
  const activePageRef = useRef(activePage);
  useEffect(() => { activePageRef.current = activePage; }, [activePage]);

  // Sync activePage → URL hash
  useEffect(() => {
    const currentPath = window.location.pathname;
    const expected = `/dashboard/${activePage}`;
    if (currentPath !== expected) {
      window.history.pushState({ page: activePage }, '', expected);
    }
  }, [activePage]);

  // Sync URL hash → activePage (back / forward)
  useEffect(() => {
    const handler = () => {
      const page = pageFromPath();
      if (page !== activePageRef.current) {
        setAssignmentData(null);
        setActivePage(page);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const handleOpenAssignment = (data) => {
    setAssignmentData(data);
    setActivePage('assignment');
  };

  const handleBackFromAssignment = () => {
    setAssignmentData(null);
    setActivePage('classroom');
  };

  // When sidebar navigates, clear assignment state
  const handleNavigate = (page) => {
    if (page !== 'assignment') {
      setAssignmentData(null);
    }
    setActivePage(page);
  };

  const pages = {
    classroom: <ClassroomPage role={role} user={user} onOpenAssignment={handleOpenAssignment} />,
    dashboard: <DashboardPageContent role={role} user={user} />,
    code: mainContent,
    settings: <SettingsPage role={role} user={user} onUserUpdate={onUserUpdate} />,
    assignment: assignmentData
      ? <AssignmentPage assignmentData={assignmentData} role={role} user={user} onBack={handleBackFromAssignment} />
      : <ClassroomPage role={role} user={user} onOpenAssignment={handleOpenAssignment} />,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Google Sans', sans-serif"}}>
      <Sidebar
        role={role}
        activePage={activePage === 'assignment' ? 'classroom' : activePage}
        onNavigate={handleNavigate}
        user={user}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onCollapseChange={onSidebarChange}
      />
      <main style={{ marginLeft: sidebarWidth, flex: 1, overflow: 'hidden', transition: 'margin-left 0.3s ease', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {pages[activePage]}
      </main>
    </div>
  );
};

export default Dashboard;
