import React, { useState } from 'react';
import Sidebar from '../components/Sidebar.js';
import ClassroomPage from './ClassroomPage.js';
import DashboardPageContent from './DashboardPageContent.js';
import SettingsPage from './SettingsPage.js';

const Dashboard = ({ user, role, onLogout, onUserUpdate, mainContent }) => {
  const [activePage, setActivePage] = useState('dashboard');

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
      />
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, overflow: 'auto'}}>
        {pages[activePage]}
      </main>
    </div>
  );
};

export default Dashboard;
