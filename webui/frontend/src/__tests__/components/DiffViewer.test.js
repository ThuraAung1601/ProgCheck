/**
 * Jest tests for src/components/DiffViewer.js
 *
 * Requirements traced:
 *   UFR-10  students see diff of their code vs correct code
 *   SNFR-6  system accessible via modern web browser
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DiffViewer from '../../components/DiffViewer';

const SAMPLE_DIFF = `--- a/foo.pl
+++ b/foo.pl
@@ -1,3 +1,3 @@
 append([], Y, Y).
-append([H|T], Y, [H|R]) :- append(T, [], R).
+append([H|T], Y, [H|R]) :- append(T, Y, R).
`;

describe('DiffViewer', () => {
  test('shows fallback message when diff is null', () => {
    render(<DiffViewer diff={null} />);
    expect(screen.getByText(/no diff available/i)).toBeInTheDocument();
  });

  test('shows fallback message when diff is empty string', () => {
    render(<DiffViewer diff="" />);
    expect(screen.getByText(/no diff available/i)).toBeInTheDocument();
  });

  test('renders a table when diff is provided', () => {
    const { container } = render(<DiffViewer diff={SAMPLE_DIFF} />);
    expect(container.querySelector('table')).toBeInTheDocument();
  });

  test('renders deleted line (starts with -)', () => {
    const diff = '@@ -1 +1 @@\n-old line\n+new line\n context\n';
    render(<DiffViewer diff={diff} />);
    expect(screen.getByText('-old line')).toBeInTheDocument();
  });

  test('renders added line (starts with +)', () => {
    const diff = '@@ -1 +1 @@\n-old line\n+new line\n context\n';
    render(<DiffViewer diff={diff} />);
    expect(screen.getByText('+new line')).toBeInTheDocument();
  });

  test('renders hunk header (@@ line)', () => {
    const diff = '@@ -1,3 +1,3 @@\n context\n';
    render(<DiffViewer diff={diff} />);
    expect(screen.getByText('@@ -1,3 +1,3 @@')).toBeInTheDocument();
  });

  test('renders file header (--- line) in the table', () => {
    render(<DiffViewer diff={SAMPLE_DIFF} />);
    expect(screen.getByText('--- a/foo.pl')).toBeInTheDocument();
  });

  test('renders context lines (no prefix)', () => {
    const diff = '@@ -1 +1 @@\n context line here\n';
    render(<DiffViewer diff={diff} />);
    expect(document.body.textContent).toContain('context line here');
  });
});
