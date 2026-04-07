/**
 * Tests for ClassroomPage.js
 *
 * Requirements traced:
 *   UFR-4   students and teachers can view classrooms and labs
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClassroomPage from '../../pages/ClassroomPage';

const studentUser = { id: 'STU001', name: 'Alice' };
const teacherUser = { id: 'TCH001', name: 'Prof' };

function mockFetchClassrooms(classrooms = []) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ classrooms }),
  });
}

function mockFetchError() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
}

afterEach(() => jest.resetAllMocks());

describe('ClassroomPage — student view', () => {
  test('renders without crashing', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    expect(() =>
      render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />)
    ).not.toThrow();
  });

  test('shows classrooms after load', async () => {
    mockFetchClassrooms([
      { class_id: 'C1', class_name: 'CS101', prerequisites: 'None' },
    ]);
    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('CS101')).toBeInTheDocument()
    );
  });

  test('shows error message on fetch failure', async () => {
    mockFetchError();
    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/error|failed|http 500/i)
    );
  });

  test('shows empty state when no classrooms', async () => {
    mockFetchClassrooms([]);
    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/no classrooms|not enrolled|enrolled/i)
    );
  });

  test('does not fetch when user is null', () => {
    global.fetch = jest.fn();
    render(<ClassroomPage role="student" user={null} onOpenAssignment={jest.fn()} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('ClassroomPage — teacher view', () => {
  test('renders teacher classroom list', async () => {
    mockFetchClassrooms([
      { class_id: 'C2', class_name: 'Prolog 101', prerequisites: '' },
    ]);
    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('Prolog 101')).toBeInTheDocument()
    );
  });

  test('shows Create Classroom button for teacher', async () => {
    mockFetchClassrooms([]);
    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /create|new classroom/i }) ||
        document.body.textContent.match(/create/i)
      ).toBeTruthy()
    );
  });
});

describe('ClassroomPage — classroom selection', () => {
  test('clicking a classroom card triggers lab fetch', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [{ class_id: 'C1', class_name: 'CS101', prerequisites: '' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [] }) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));

    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
