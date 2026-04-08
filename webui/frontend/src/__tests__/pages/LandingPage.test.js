/**
 * Jest tests for src/pages/LandingPage.js
 *
 * Requirements traced:
 *   UFR-1   students and teachers can register / log in
 *   SNFR-6  system accessible via modern web browser
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingPage from '../../pages/LandingPage';

describe('LandingPage', () => {
  const noop = jest.fn();

  test('renders without crashing', () => {
    const { container } = render(
      <LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />
    );
    expect(container.firstChild).not.toBeNull();
  });

  test('shows ProgCheck brand name', () => {
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />);
    expect(screen.getAllByText(/ProgCheck/i).length).toBeGreaterThan(0);
  });

  test('has at least one login or get started button', () => {
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('scroll event does not crash', () => {
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />);
    fireEvent.scroll(window, { target: { scrollY: 50 } });
  });

  test('cleanup removes scroll listener', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />
    );
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeSpy.mockRestore();
  });

  test('Student Login button calls onStudentLogin', () => {
    const onStudentLogin = jest.fn();
    render(<LandingPage onStudentLogin={onStudentLogin} onTeacherLogin={noop} onSignup={noop} />);
    fireEvent.click(screen.getByText('Student Login'));
    expect(onStudentLogin).toHaveBeenCalled();
  });

  test('Teacher Login button calls onTeacherLogin', () => {
    const onTeacherLogin = jest.fn();
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={onTeacherLogin} onSignup={noop} />);
    fireEvent.click(screen.getByText('Teacher Login'));
    expect(onTeacherLogin).toHaveBeenCalled();
  });

  test('Get Started button opens role modal', () => {
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />);
    fireEvent.click(screen.getByText('Get Started'));
    expect(screen.getByText('Choose your role')).toBeInTheDocument();
  });

  test('modal Student button calls onSignup with student', () => {
    const onSignup = jest.fn();
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={onSignup} />);
    fireEvent.click(screen.getByText('Get Started'));
    const [studentBtn] = screen.getAllByText('Student');
    fireEvent.click(studentBtn);
    expect(onSignup).toHaveBeenCalledWith('student');
  });

  test('modal Teacher button calls onSignup with teacher', () => {
    const onSignup = jest.fn();
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={onSignup} />);
    fireEvent.click(screen.getByText('Get Started'));
    fireEvent.click(screen.getByText('Teacher'));
    expect(onSignup).toHaveBeenCalledWith('teacher');
  });

  test('modal Cancel button closes the modal', () => {
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />);
    fireEvent.click(screen.getByText('Get Started'));
    expect(screen.getByText('Choose your role')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Choose your role')).not.toBeInTheDocument();
  });

  test('footer shows copyright text', () => {
    render(<LandingPage onStudentLogin={noop} onTeacherLogin={noop} onSignup={noop} />);
    expect(document.body.textContent).toMatch(/ProgCheck/);
  });
});
