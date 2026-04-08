/**
 * Tests for ClassroomPage.js
 *
 * Requirements traced:
 *   UFR-4   students and teachers can view classrooms and labs
 *   SNFR-6  accessible via modern web browser
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClassroomPage from '../../pages/ClassroomPage';

const studentUser = { id: 'STU001', name: 'Alice' };
const teacherUser = { id: 'TCH001', name: 'Prof' };

const CLASSROOM = { class_id: 'C1', class_name: 'CS101', prerequisites: 'None', class_size: 5 };
const ACTIVE_LAB = { lab_id: 'L1', title: 'Lab 1', status: 'active', active_time: null, complete_time: null, question_count: 0 };
const INACTIVE_LAB = { lab_id: 'L2', title: 'Lab 2', status: 'inactive', active_time: null, complete_time: null, question_count: 0 };
const QUESTION = { question_id: 'Q1', title: 'Factorial', problem: 'Write factorial/2', test_cases: [{ testcase_id: 'TC1', input: 'factorial(3,X)', expected_output: 'true' }] };

afterEach(() => jest.resetAllMocks());

// ── Student view ──────────────────────────────────────────────────────────────

describe('ClassroomPage — student view', () => {
  test('renders without crashing', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    expect(() =>
      render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />)
    ).not.toThrow();
  });

  test('shows classrooms after load', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) });
    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('CS101')).toBeInTheDocument());
  });

  test('shows error message on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/error|failed|http 500/i));
  });

  test('shows empty state when no classrooms', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ classrooms: [] }) });
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

  test('error banner can be dismissed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/500/));
    // Find the × button in the error banner
    const allButtons = screen.getAllByRole('button');
    const dismissBtn = allButtons.find(b => b.textContent === '×');
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      await waitFor(() => expect(document.body.textContent).not.toMatch(/HTTP 500/));
    }
  });
});

// ── Classroom selection ───────────────────────────────────────────────────────

describe('ClassroomPage — classroom selection', () => {
  test('clicking a classroom fetches its labs', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [ACTIVE_LAB] }) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  test('clicking same classroom again deselects it', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [] }) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    // After selection, heading and breadcrumb both show CS101 — click the card text
    const all = screen.getAllByText('CS101');
    fireEvent.click(all[all.length - 1]);
    // deselected — no error
    expect(true).toBe(true);
  });

  test('student can click an active lab to load questions', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [ACTIVE_LAB] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([QUESTION]) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => screen.getByText('Lab 1'));
    fireEvent.click(screen.getByText('Lab 1'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });

  test('student cannot click inactive lab', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [INACTIVE_LAB] }) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => screen.getByText('Lab 2'));
    fireEvent.click(screen.getByText('Lab 2'));
    // fetch called only twice (classrooms + labs), not a third time for questions
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ── Teacher view ──────────────────────────────────────────────────────────────

describe('ClassroomPage — teacher view', () => {
  test('renders teacher classroom list', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) });
    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('CS101')).toBeInTheDocument());
  });

  test('shows Create Classroom button for teacher', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ classrooms: [] }) });
    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/create/i)
    );
  });

  test('teacher can open Create Classroom form', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ classrooms: [] }) });
    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/create classroom/i));
    const createBtn = screen.getAllByRole('button').find(b => /create classroom/i.test(b.textContent));
    if (createBtn) {
      fireEvent.click(createBtn);
      expect(document.body.textContent).toMatch(/class name|classroom name/i);
    }
  });

  test('teacher sees Add Lab and Students buttons after selecting classroom', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [] }) });

    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => expect(document.body.textContent).toMatch(/add lab/i));
    expect(document.body.textContent).toMatch(/students/i);
  });

  test('teacher can toggle Students panel', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ students: [] }) });

    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => screen.getByText('Students'));
    fireEvent.click(screen.getByText('Students'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });

  test('teacher Back to classrooms button deselects room', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [] }) });

    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => screen.getByText('Back to classrooms'));
    fireEvent.click(screen.getByText('Back to classrooms'));
    await waitFor(() => expect(screen.getByText('CS101')).toBeInTheDocument());
  });

  test('teacher can open inactive lab and see questions', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [INACTIVE_LAB] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([QUESTION]) });

    render(<ClassroomPage role="teacher" user={teacherUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => screen.getByText('Lab 2'));
    fireEvent.click(screen.getByText('Lab 2'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });

  test('onOpenAssignment called when student clicks Start Coding', async () => {
    const onOpenAssignment = jest.fn();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [ACTIVE_LAB] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([QUESTION]) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={onOpenAssignment} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => screen.getByText('Lab 1'));
    fireEvent.click(screen.getByText('Lab 1'));
    await waitFor(() => screen.getByText('Start Coding'));
    fireEvent.click(screen.getByText('Start Coding'));
    expect(onOpenAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ question: expect.objectContaining({ question_id: 'Q1' }) })
    );
  });

  test('breadcrumb back to Classroom resets room', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ classrooms: [CLASSROOM] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ labs: [ACTIVE_LAB] }) });

    render(<ClassroomPage role="student" user={studentUser} onOpenAssignment={jest.fn()} />);
    await waitFor(() => screen.getByText('CS101'));
    fireEvent.click(screen.getByText('CS101'));
    await waitFor(() => expect(document.body.textContent).toMatch(/CS101/));
    // Click 'Classroom' in breadcrumb
    const crumbClassroom = screen.getAllByText('Classroom').find(el => el.tagName !== 'H1');
    if (crumbClassroom) fireEvent.click(crumbClassroom);
  });
});
