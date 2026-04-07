/**
 * Jest tests for src/components/Sidebar.js
 *
 * Requirements traced:
 *   UFR-2   users can navigate between pages after login
 *   SNFR-6  system accessible via modern web browser
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Sidebar from '../../components/Sidebar';

const user = { display_name: 'Alice', id: 'S001' };

function renderSidebar(props = {}) {
  return render(
    <Sidebar
      role="student"
      activePage="classroom"
      onNavigate={jest.fn()}
      user={user}
      onLogout={jest.fn()}
      collapsed={false}
      onCollapseChange={jest.fn()}
      {...props}
    />
  );
}

describe('Sidebar — expanded', () => {
  test('renders ProgCheck brand name', () => {
    renderSidebar();
    expect(screen.getByText('ProgCheck')).toBeInTheDocument();
  });

  test('shows Student Portal for student role', () => {
    renderSidebar({ role: 'student' });
    expect(screen.getByText(/student portal/i)).toBeInTheDocument();
  });

  test('shows Instructor Portal for teacher role', () => {
    renderSidebar({ role: 'teacher', user: { ...user, id: 'T001' } });
    expect(screen.getByText(/instructor portal/i)).toBeInTheDocument();
  });

  test('shows nav item labels when expanded', () => {
    renderSidebar();
    expect(screen.getByText('Classroom')).toBeInTheDocument();
    expect(screen.getByText('Code Editor')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('shows user display name', () => {
    renderSidebar();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  test('calls onNavigate when nav item clicked', () => {
    const onNavigate = jest.fn();
    renderSidebar({ onNavigate });
    fireEvent.click(screen.getByText('Settings'));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  test('calls onLogout when logout button clicked', () => {
    const onLogout = jest.fn();
    renderSidebar({ onLogout });
    // logout button has title="Log out"
    fireEvent.click(screen.getByTitle('Log out'));
    expect(onLogout).toHaveBeenCalled();
  });

  test('calls onCollapseChange when collapse button clicked', () => {
    const onCollapseChange = jest.fn();
    renderSidebar({ onCollapseChange, collapsed: false });
    fireEvent.click(screen.getByTitle('Collapse sidebar'));
    expect(onCollapseChange).toHaveBeenCalledWith(true);
  });
});

describe('Sidebar — collapsed', () => {
  test('does not show brand name text when collapsed', () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText('ProgCheck')).not.toBeInTheDocument();
  });

  test('calls onCollapseChange(false) when collapsed and button clicked', () => {
    const onCollapseChange = jest.fn();
    renderSidebar({ collapsed: true, onCollapseChange });
    fireEvent.click(screen.getByTitle('Expand sidebar'));
    expect(onCollapseChange).toHaveBeenCalledWith(false);
  });
});
