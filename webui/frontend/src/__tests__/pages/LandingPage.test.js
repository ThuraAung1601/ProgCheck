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
    // no assertion needed — just confirm no throw
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
});
