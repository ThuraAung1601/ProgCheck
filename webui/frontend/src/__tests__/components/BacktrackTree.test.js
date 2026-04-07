/**
 * Tests for BacktrackTree.js
 *
 * Requirements traced:
 *   UFR-8   students see backtracking tree visualization
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BacktrackTree from '../../components/BacktrackTree';

// BacktrackTree expects a flat trace array with parentId references
// (same format as buildExampleTrace from traceFormat.js)
const makeNode = (id, goal, parentId = null, result = 'success') => ({
  id,
  parentId,
  goal,
  clause: parentId ? 'append([H|T],Y,[H|R]) :- append(T,Y,R).' : 'append([],Y,Y).',
  result,
  bindings: {},
  cutPrevented: false,
  depth: parentId ? 1 : 0,
  lineStart: 1,
  lineEnd: 1,
  clauseIndex: 0,
  children: [],
});

const SIMPLE_TRACE = [
  makeNode('n1', 'append([],Y,Y)', null, 'success'),
  makeNode('n2', 'append([a],[b],[a,b])', 'n1', 'success'),
];

describe('BacktrackTree', () => {
  test('renders without crashing with empty trace', () => {
    expect(() =>
      render(<BacktrackTree trace={[]} />)
    ).not.toThrow();
  });

  test('renders without crashing with nodes', () => {
    expect(() =>
      render(<BacktrackTree trace={SIMPLE_TRACE} />)
    ).not.toThrow();
  });

  test('renders SVG element', () => {
    const { container } = render(<BacktrackTree trace={SIMPLE_TRACE} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  test('renders with compact prop without crashing', () => {
    expect(() =>
      render(<BacktrackTree trace={SIMPLE_TRACE} compact={true} />)
    ).not.toThrow();
  });

  test('renders with onHighlightLine prop without crashing', () => {
    expect(() =>
      render(<BacktrackTree trace={SIMPLE_TRACE} onHighlightLine={jest.fn()} />)
    ).not.toThrow();
  });

  test('renders node with fail result without crashing', () => {
    const failTrace = [makeNode('f1', 'bad_goal', null, 'fail')];
    expect(() =>
      render(<BacktrackTree trace={failTrace} />)
    ).not.toThrow();
  });

  test('renders node with cut result without crashing', () => {
    const cutTrace = [makeNode('c1', 'cut_goal', null, 'cut')];
    expect(() =>
      render(<BacktrackTree trace={cutTrace} />)
    ).not.toThrow();
  });

  test('renders cutPrevented node without crashing', () => {
    const ghostTrace = [
      { ...makeNode('g1', 'ghost_goal', 'n1'), cutPrevented: true, cutBy: 'n1' },
      makeNode('n1', 'parent', null, 'cut'),
    ];
    expect(() =>
      render(<BacktrackTree trace={ghostTrace} />)
    ).not.toThrow();
  });
});
