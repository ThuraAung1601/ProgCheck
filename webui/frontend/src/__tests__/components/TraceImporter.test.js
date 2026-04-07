/**
 * Tests for TraceImporter.js
 *
 * Requirements traced:
 *   UFR-7   users can import trace output for visualization
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TraceImporter from '../../components/TraceImporter';

const SAMPLE_TRACE = `Query: max(7, 2, 7)
Execution Trace:
Depth 1: max(7,2,7)
Proof Tree:
Goal: max(7,2,7) :- 7>=2,!
    Builtin: 7>=2
    Builtin: !
---`;

describe('TraceImporter', () => {
  test('renders without crashing', () => {
    expect(() =>
      render(
        <TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={jest.fn()} />
      )
    ).not.toThrow();
  });

  test('shows a textarea for pasting trace output', () => {
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={jest.fn()} />);
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  test('shows Parse output button', () => {
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={jest.fn()} />);
    // Button text is "Parse output"
    expect(
      screen.getByRole('button', { name: /parse/i })
    ).toBeInTheDocument();
  });

  test('shows Cancel button and calls onCancel when clicked', () => {
    const onCancel = jest.fn();
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={onCancel} />);
    // Footer Cancel button
    const cancelBtns = screen.getAllByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(onCancel).toHaveBeenCalled();
  });

  test('Parse button is disabled when textarea is empty', () => {
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={jest.fn()} />);
    const parseBtn = screen.getByRole('button', { name: /parse/i });
    expect(parseBtn).toBeDisabled();
  });

  test('Visualize button is disabled before parsing', () => {
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={jest.fn()} />);
    // Footer "↯ Visualize" button is disabled when parsed is null
    const vizBtn = screen.getByRole('button', { name: /visualize/i });
    expect(vizBtn).toBeDisabled();
  });

  test('parses valid trace and shows found queries text', async () => {
    const user = userEvent.setup();
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={jest.fn()} />);

    const textarea = document.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: SAMPLE_TRACE } });

    const parseBtn = screen.getByRole('button', { name: /parse/i });
    await user.click(parseBtn);

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/found|quer/i)
    );
  });

  test('calls onTraceLoaded when Visualize button clicked after parsing', async () => {
    const onTraceLoaded = jest.fn();
    const user = userEvent.setup();
    render(<TraceImporter code="" onTraceLoaded={onTraceLoaded} onCancel={jest.fn()} />);

    const textarea = document.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: SAMPLE_TRACE } });

    const parseBtn = screen.getByRole('button', { name: /parse/i });
    await user.click(parseBtn);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /visualize/i })).not.toBeDisabled()
    );

    await user.click(screen.getByRole('button', { name: /visualize/i }));
    expect(onTraceLoaded).toHaveBeenCalled();
  });

  test('X button in header also calls onCancel', () => {
    const onCancel = jest.fn();
    render(<TraceImporter code="" onTraceLoaded={jest.fn()} onCancel={onCancel} />);
    // Header ✕ button
    const xBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(xBtn);
    expect(onCancel).toHaveBeenCalled();
  });
});
