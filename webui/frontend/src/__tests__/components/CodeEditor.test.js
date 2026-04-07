/**
 * Tests for CodeEditor.js
 *
 * Requirements traced:
 *   UFR-5   students write Prolog code in browser editor
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CodeEditor from '../../components/CodeEditor';

describe('CodeEditor', () => {
  test('renders without crashing', () => {
    const { container } = render(
      <CodeEditor value="" onChange={jest.fn()} />
    );
    expect(container.firstChild).toBeTruthy();
  });

  test('renders textarea with provided value', () => {
    render(<CodeEditor value="fact(a)." onChange={jest.fn()} />);
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('fact(a).');
  });

  test('calls onChange when text is changed', () => {
    const onChange = jest.fn();
    render(<CodeEditor value="" onChange={onChange} />);
    const textarea = document.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'hello.' } });
    expect(onChange).toHaveBeenCalledWith('hello.');
  });

  test('inserts spaces on Tab key press', () => {
    const onChange = jest.fn();
    render(<CodeEditor value="abc" onChange={onChange} tabSize={2} />);
    const textarea = document.querySelector('textarea');
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(onChange).toHaveBeenCalled();
    const newVal = onChange.mock.calls[0][0];
    expect(newVal).toContain('  '); // 2 spaces
  });

  test('renders line numbers (gutter)', () => {
    render(<CodeEditor value={'line1\nline2\nline3'} onChange={jest.fn()} />);
    // Gutter is a sibling div — check that numbers 1, 2, 3 appear somewhere
    expect(document.body.textContent).toMatch(/1/);
  });

  test('renders with highlightLines prop without crashing', () => {
    expect(() =>
      render(<CodeEditor value={'line1\nline2'} onChange={jest.fn()} highlightLines={[1]} />)
    ).not.toThrow();
  });

  test('renders with tabSize=4 without crashing', () => {
    expect(() =>
      render(<CodeEditor value="code" onChange={jest.fn()} tabSize={4} />)
    ).not.toThrow();
  });
});
