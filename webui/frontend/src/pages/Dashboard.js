import React, { useState } from 'react';
import Sidebar from '../components/Sidebar.js';
import ClassroomPage from './ClassroomPage.js';
import DashboardPageContent from './DashboardPageContent.js';
import SettingsPage from './SettingsPage.js';

const Dashboard = ({ user, role, onLogout, onUserUpdate, mainContent, sidebarCollapsed, onSidebarChange }) => {
  const [activePage, setActivePage] = useState('dashboard');
  const sidebarWidth = sidebarCollapsed ? '80px' : 'var(--sidebar-w)';

  const pages = {
    classroom: <ClassroomPage role={role} />,
    dashboard: <DashboardPageContent role={role} user={user} />,
    code: mainContent,
    settings: <SettingsPage role={role} user={user} onUserUpdate={onUserUpdate} />,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Google Sans', sans-serif"}}>
      <Sidebar 
        role={role} 
        activePage={activePage} 
        onNavigate={setActivePage} 
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
