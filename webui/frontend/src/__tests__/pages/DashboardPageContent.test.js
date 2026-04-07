/**
 * Jest tests for src/pages/DashboardPageContent.js
 *
 * Requirements traced:
 *   UFR-3   students see their dashboard
 *   SNFR-6  system accessible via modern web browser
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPageContent from '../../pages/DashboardPageContent';

const studentUser = { name: 'Alice', display_name: 'Alice Smith' };
const teacherUser = { name: 'Prof', display_name: 'Prof Jones' };

describe('DashboardPageContent', () => {
  test('shows loading when user is null', () => {
    render(<DashboardPageContent role="student" user={null} />);
    expect(screen.getByText(/loading user data/i)).toBeInTheDocument();
  });

  test('shows welcome message with display_name', () => {
    render(<DashboardPageContent role="student" user={studentUser} />);
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  test('shows student stats when role is student', () => {
    render(<DashboardPageContent role="student" user={studentUser} />);
    expect(screen.getByText('Labs Completed')).toBeInTheDocument();
    expect(screen.getByText('Average Score')).toBeInTheDocument();
    expect(screen.getByText('Submissions')).toBeInTheDocument();
    expect(screen.getByText('Pending Labs')).toBeInTheDocument();
  });

  test('shows teacher stats when role is teacher', () => {
    render(<DashboardPageContent role="teacher" user={teacherUser} />);
    expect(screen.getByText('Total Students')).toBeInTheDocument();
    expect(screen.getByText('Active Labs')).toBeInTheDocument();
    expect(screen.getByText('Submissions Today')).toBeInTheDocument();
    expect(screen.getByText('Avg. Class Score')).toBeInTheDocument();
  });

  test('shows "studies" in description for student', () => {
    render(<DashboardPageContent role="student" user={studentUser} />);
    expect(screen.getByText(/studies/)).toBeInTheDocument();
  });

  test('shows "classes" in description for teacher', () => {
    render(<DashboardPageContent role="teacher" user={teacherUser} />);
    expect(screen.getByText(/classes/)).toBeInTheDocument();
  });

  test('uses name fallback when display_name absent', () => {
    render(<DashboardPageContent role="student" user={{ name: 'Bob' }} />);
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  test('uses "User" fallback when both name and display_name absent', () => {
    render(<DashboardPageContent role="student" user={{}} />);
    expect(screen.getByText(/User/)).toBeInTheDocument();
  });
});
